import { createClient } from '@supabase/supabase-js';
import { ResearchMode, ResearchType } from '../store/slices/researchSlice';

// Error types
export enum ResearchError {
  GENERATION_ERROR = 'GENERATION_ERROR',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'
}

export class ResearchException extends Error {
  constructor(
    public readonly code: ResearchError,
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ResearchException';
  }
}

// API Configuration
const isProd = import.meta.env.PROD;
const supabaseUrl = isProd 
  ? import.meta.env.VITE_SUPABASE_URL 
  : import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = isProd 
  ? import.meta.env.VITE_SUPABASE_KEY 
  : import.meta.env.VITE_SUPABASE_KEY;
const GROQ_API_KEY = isProd 
  ? import.meta.env.VITE_GROQ_API_KEY 
  : import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = isProd 
  ? (import.meta.env.VITE_GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions')
  : (import.meta.env.VITE_GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  throw new ResearchException(
    ResearchError.CONFIGURATION_ERROR,
    'Application configuration error. Please check your environment variables.'
  );
}

// Initialize Supabase client with CORS configuration
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    debug: !isProd,
    storage: window.localStorage
  },
  db: {
    schema: 'public'
  }
});

// Configure auth settings
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('User signed in:', session?.user?.email);
  }
});

// GROQ Configuration
if (!GROQ_API_KEY) {
  throw new ResearchException(
    ResearchError.CONFIGURATION_ERROR,
    'Missing GROQ API key. Please check your environment variables.'
  );
}

const GROQ_CONFIG = {
  API_URL: GROQ_API_URL,
  API_KEY: GROQ_API_KEY,
  MODEL: 'mixtral-8x7b-32768',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 8000,
  MAX_RETRIES: 3,
  BASE_DELAY: 20000 // 20 seconds base delay
};

// Types
export interface GroqMessage {
  role: string;
  content: string;
}

export interface GroqResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export interface OutlineItem {
  number: string;
  title: string;
  description: string;
  isSubsection: boolean;
  level: number;
  keywords?: string[];
}

export interface ResearchSection {
  title: string;
  content: string;
  number: string;
  warning?: string;
}

const handleApiError = (error: unknown, defaultMessage: string): never => {
  console.error('API error:', error);
  if (error instanceof ResearchException) {
    throw error;
  }
  throw new ResearchException(
    ResearchError.API_ERROR,
    error instanceof Error ? error.message : defaultMessage
  );
};

const makeGroqApiCall = async (
  prompt: string,
  maxTokens: number = GROQ_CONFIG.MAX_TOKENS,
  systemPrompt?: string
): Promise<GroqResponse> => {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        top_p: 1,
        stop: null,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new ResearchException(
        ResearchError.API_ERROR,
        `API request failed: ${response.status} ${response.statusText}${
          errorData ? ' - ' + JSON.stringify(errorData) : ''
        }`
      );
    }

    const data = await response.json();
    
    if (!data?.choices?.[0]?.message?.content) {
      throw new ResearchException(
        ResearchError.API_ERROR,
        'Invalid API response format: ' + JSON.stringify(data)
      );
    }

    return data;
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to generate content');
  }
};

const makeApiCall = async <T>(
  apiCall: () => Promise<T>,
  errorMessage: string
): Promise<T> => {
  try {
    return await apiCall();
  } catch (error: unknown) {
    return handleApiError(error, errorMessage);
  }
};

// API Functions
export const generateTitle = async (topic: string): Promise<string> => {
  return makeApiCall(
    async () => {
      const response = await makeGroqApiCall(
        `Generate a concise, engaging title for a research paper about: ${topic}`,
        100
      );
      return response.choices[0].message.content.trim();
    },
    'Failed to generate title'
  );
};

export const generateSection = async (
  topic: string,
  sectionTitle: string,
  sectionDescription: string,
  mode: ResearchMode = ResearchMode.Basic,
  type: ResearchType = ResearchType.General
): Promise<string> => {
  const bulletPoints = sectionDescription
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('•') || line.startsWith('-'))
    .join('\n');

  return makeApiCall(
    async () => {
      const response = await makeGroqApiCall(
        `Generate detailed content for section ${sectionTitle} of a ${mode} level research paper:

Topic: ${topic}
Research Type: ${type}
Section: ${sectionTitle}

Key Points to Cover:
${bulletPoints}

Instructions:
1. Generate comprehensive content that addresses all the bullet points
2. Follow ${mode} level depth and complexity
3. Maintain academic writing style
4. Include relevant examples and evidence
5. Ensure logical flow and transitions`,
        1000
      );
      return response.choices[0].message.content.trim();
    },
    `Failed to generate section content for "${sectionTitle}"`
  );
};

export const generateSectionBatch = async (
  sections: { sectionTitle: string; sectionDescription: string }[]
): Promise<string[]> => {
  return makeApiCall(
    async () => {
      if (!sections || sections.length === 0) {
        throw new ResearchException(
          ResearchError.VALIDATION_ERROR,
          'No sections provided for batch generation'
        );
      }

      const results: string[] = [];
      for (const section of sections) {
        const content = await generateSection(
          section.sectionTitle,
          section.sectionTitle,
          section.sectionDescription
        );
        results.push(content);
      }
      return results;
    },
    'Failed to generate section batch'
  );
};

export const searchPapers = async (topic: string): Promise<any[]> => {
  return makeApiCall(
    async () => {
      const searchResults = await makeGroqApiCall(
        `Search for academic papers and references related to: ${topic}

Requirements:
1. Find relevant academic papers, articles, and research publications
2. Include title, authors, and publication year if available
3. Focus on peer-reviewed sources
4. Prioritize recent publications`,
        500
      );
      
      try {
        const results = JSON.parse(searchResults.choices[0].message.content);
        return Array.isArray(results) ? results : [];
      } catch {
        // If the response isn't valid JSON, return an empty array
        return [];
      }
    },
    'Failed to search papers'
  );
};

export const generateReferences = async (
  topic: string,
  options: { minRefs?: number; maxRefs?: number } = {}
): Promise<string> => {
  return makeApiCall(
    async () => {
      const response = await makeGroqApiCall(
        `Generate a list of academic references for a research paper about: ${topic}
         Include between ${options.minRefs || 5} and ${options.maxRefs || 10} references.`,
        1000
      );
      return response.choices[0].message.content.trim();
    },
    'Failed to generate references'
  );
};

export const generateDetailedOutline = async (
  topic: string,
  mode: ResearchMode,
  type: ResearchType
): Promise<string> => {
  // Extract section count requirements first
  const rangeMatch = topic.match(/contain between (\d+) and (\d+) main sections/);
  const min = rangeMatch ? parseInt(rangeMatch[1]) : 3;
  const max = rangeMatch ? parseInt(rangeMatch[2]) : 25;

  return makeApiCall(
    async () => {
      const response = await makeGroqApiCall(
        `Create a detailed ${type} research outline with ${min} to ${max} main sections for the following topic. The outline MUST contain between ${min} and ${max} main sections, no more and no less:

Topic: "${topic}"

Requirements:
1. Generate EXACTLY between ${min} and ${max} main sections
2. Each section must use one of these formats:
   - Numbers (1., 2., 3., etc.)
   - Letters (A., B., C., etc. or a., b., c., etc.)
   - Roman numerals (I., II., III., etc.)
3. Include descriptive bullet points for each section
4. Maintain logical flow between sections
5. Ensure comprehensive topic coverage`,
        1000,
        `You are an expert research outline generator. Create a detailed, well-structured outline for a ${mode} level ${type} research paper.`
      );
      return response.choices[0].message.content.trim();
    },
    'Failed to generate detailed outline'
  );
};

export const saveResearch = async (
  userId: string,
  data: any
): Promise<{ id: string }> => {
  return makeApiCall(
    async () => {
      const { data: result, error } = await supabase
        .from('research')
        .insert([{ user_id: userId, ...data }])
        .select('id')
        .single();

      if (error) throw error;
      if (!result?.id) throw new Error('Failed to get research ID');
      return { id: result.id };
    },
    'Failed to save research'
  );
};

export const getResearchHistory = async (
  userId: string
): Promise<any[]> => {
  return makeApiCall(
    async () => {
      const { data, error } = await supabase
        .from('research')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    'Failed to get research history'
  );
};
