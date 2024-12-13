import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

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

// API Types
interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  temperature: number;
  max_tokens: number;
}

export interface ResearchSection {
  title: string;
  content: string;
  number: string;
  warning?: string;
}

interface SectionRef {
  retryCount: number;
}

export interface OutlineItem {
  number: string;
  title: string;
  description: string;
  isSubsection: boolean;
  level: number;
  keywords?: string[];
}

// Helper Functions
const waitBetweenCalls = async (retryCount = 0): Promise<void> => {
  const delay = GROQ_CONFIG.BASE_DELAY * Math.pow(2, retryCount);
  await new Promise(resolve => setTimeout(resolve, delay));
};

// API Call Functions
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

async function makeGroqApiCall(
  prompt: string,
  maxTokens: number = GROQ_CONFIG.MAX_TOKENS,
  systemPrompt?: string
): Promise<GroqResponse> {
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
        ResearchError.GENERATION_ERROR,
        `API request failed: ${response.status} ${response.statusText}${
          errorData ? ' - ' + JSON.stringify(errorData) : ''
        }`
      );
    }

    const data = await response.json();
    
    if (!data?.choices?.[0]?.message?.content) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'Invalid API response format: ' + JSON.stringify(data)
      );
    }

    return data;
  } catch (error: unknown) {
    handleApiError(error, 'Failed to generate content');
  }
};

async function makeApiCall<T>(
  apiCall: () => Promise<T>,
  errorMessage: string,
  retryCount: number = 3
): Promise<T> {
  try {
    return await apiCall();
  } catch (error: unknown) {
    handleApiError(error, errorMessage);
  }
};

export async function generateTitle(query: string): Promise<string> {
  const systemPrompt = 'You are a research title generator. Generate a clear, concise, and academic title for the given research topic.';
  const prompt = `Generate a one sentence research title for the following topic: ${query}`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate title'
    );
    return response.choices[0].message.content.trim();
  } catch (error: unknown) {
    handleApiError(error, 'Failed to generate title');
  }
};

export async function generateSection(
  topic: string,
  sectionTitle: string,
  sectionDescription: string,
  mode: string = 'basic',
  type: string = 'general'
): Promise<string> {
  const bulletPoints = sectionDescription
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('•') || line.startsWith('-'))
    .join('\n');

  const prompt = `
Generate detailed content for section ${sectionTitle} of a ${mode} level research paper:

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
5. Ensure logical flow and transitions

Generate the section content now:`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS),
      `Failed to generate section content for "${sectionTitle}"`,
      0
    );

    return response.choices[0].message.content.trim();
  } catch (error: unknown) {
    handleApiError(error, `Failed to generate section content for "${sectionTitle}"`);
  }
};

export async function generateSectionBatch(
  sections: Array<{ sectionTitle: string; prompt: string }>
): Promise<string[]> {
  try {
    if (!sections || sections.length === 0) {
      throw new ResearchException(
        ResearchError.VALIDATION_ERROR,
        'No sections provided for batch generation'
      );
    }

    const results: string[] = [];
    
    for (const section of sections) {
      try {
        const response = await makeApiCall(
          () => makeGroqApiCall(section.prompt, GROQ_CONFIG.MAX_TOKENS),
          `Failed to generate section "${section.sectionTitle}"`,
          GROQ_CONFIG.MAX_RETRIES
        );
        
        const content = response.choices[0].message.content.trim();
        if (!content) {
          throw new Error('Empty content received from API');
        }
        
        results.push(content);
      } catch (error: unknown) {
        handleApiError(error, `Failed to generate section "${section.sectionTitle}"`);
      }
    }

    return results;
  } catch (error: unknown) {
    handleApiError(error, 'Failed to generate section batch');
  }
};

export async function searchPapers(searchQuery: string): Promise<any[]> {
  try {
    // Implement paper search functionality
    return [];
  } catch (error: unknown) {
    handleApiError(error, 'Failed to search papers');
  }
};

export async function generateReferences(
  topic: string,
  ref: Partial<SectionRef> = { retryCount: 0 }
): Promise<string> {
  try {
    const systemPrompt = `You are a research reference generator. Generate a list of academic references for the given research topic.
Instructions:
- Include a mix of recent and seminal works
- Use proper academic citation format
- Focus on peer-reviewed sources
- Include 10-15 references`;

    const prompt = `Generate a list of academic references for research about: "${topic}"
The references should be relevant, authoritative, and properly formatted.`;

    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate references',
      ref.retryCount || 0
    );

    const content = response.choices[0].message.content.trim();
    const referenceCount = content.split('\n').filter((line: string) => line.trim().length > 0).length;

    if (referenceCount < 10 && (ref.retryCount || 0) < GROQ_CONFIG.MAX_RETRIES) {
      console.log(`Generated too few references (${referenceCount}). Retrying...`);
      await waitBetweenCalls(ref.retryCount || 0);
      return generateReferences(topic, { retryCount: (ref.retryCount || 0) + 1 });
    }

    return content;
  } catch (error: unknown) {
    handleApiError(error, 'Failed to generate references');
  }
}

export async function generateDetailedOutline(
  topic: string,
  mode: string = 'basic',
  type: string = 'general'
): Promise<string> {
  // Extract section count requirements first
  const rangeMatch = topic.match(/contain between (\d+) and (\d+) main sections/);
  const min = rangeMatch ? parseInt(rangeMatch[1]) : 3;
  const max = rangeMatch ? parseInt(rangeMatch[2]) : 25;

  const prompt = `Create a detailed ${type} research outline with ${min} to ${max} main sections for the following topic. The outline MUST contain between ${min} and ${max} main sections, no more and no less:

Topic: "${topic}"

Requirements:
1. Generate EXACTLY between ${min} and ${max} main sections
2. Each section must use one of these formats:
   - Numbers (1., 2., 3., etc.)
   - Letters (A., B., C., etc. or a., b., c., etc.)
   - Roman numerals (I., II., III., etc.)
3. Include descriptive bullet points for each section
4. Maintain logical flow between sections
5. Ensure comprehensive topic coverage`;

  const systemPrompt = `You are an expert research outline generator. Create a detailed, well-structured outline for a ${mode} level ${type} research paper.

IMPORTANT SECTION COUNT REQUIREMENT:
- You MUST generate between ${min} and ${max} main sections
- No more and no less than this range is acceptable
- Each main section must use one of these formats:
  * Numbers (1., 2., 3., etc.)
  * Letters (A., B., C., etc. or a., b., c., etc.)
  * Roman numerals (I., II., III., etc.)

The outline must follow these requirements:

1. Structure:
   - Generate between ${min} and ${max} main sections
   - Each main section must have descriptive bullet points
   - Maintain logical flow and progression of ideas
   - Ensure comprehensive coverage of the topic

2. Content Requirements:
   - Focus on providing a comprehensive overview with balanced coverage
   - Each section should build upon previous sections
   - Include both theoretical and practical aspects where applicable
   - Consider current research trends and developments

3. Format Requirements:
   - Use consistent section numbering (choose one: numbers, letters, or roman numerals)
   - Use bullet points (•) for section descriptions
   - Each section MUST have multiple descriptive bullet points`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      `Failed to generate outline for "${topic}"`,
      0
    );

    if (!response?.choices?.[0]?.message?.content) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'Failed to generate outline: Empty response from AI'
      );
    }

    const outline = response.choices[0].message.content.trim();
    
    if (!outline) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'Failed to generate outline: Empty outline content'
      );
    }

    console.log('Raw outline generated:', outline); // Debug log

    // Parse and count sections based on format: [number|letter|roman numeral]. [title]
    const lines = outline.split('\n');
    let sections: string[] = [];
    
    // Regex pattern to match section headers:
    // Matches: "1. Title" or "A. Title" or "I. Title" or "a. Title" or "IV. Title"
    const sectionPattern = /^(?:(?:\d+|[A-Za-z]|[IVXLCDM]+)\.\s+)(.+)$/;
    
    let currentSection = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue; // Skip empty lines
      
      const match = line.match(sectionPattern);
      if (match) {
        // If we already have a current section, save it
        if (currentSection) {
          sections.push(currentSection.trim());
        }
        // Start a new section
        currentSection = line;
      } else if (currentSection) {
        // Add content to current section
        currentSection += '\n' + line;
      }
    }
    
    // Add the last section if it exists
    if (currentSection) {
      sections.push(currentSection.trim());
    }
    
    // Count total valid sections
    const sectionCount = sections.length;
    
    // Validate section count against min/max requirements
    if (sectionCount < min || sectionCount > max) {
      throw new Error(
        `Generated outline has ${sectionCount} sections, but must have between ${min} and ${max} sections.`
      );
    }

    return outline;
  } catch (error: unknown) {
    handleApiError(error, 'Failed to generate detailed outline');
  }
};

export async function saveResearch(researchData: any): Promise<{ id: string }> {
  try {
    const { data, error } = await supabase
      .from('research')
      .insert(researchData)
      .select('id')
      .single();

    if (error) throw error;
    return { id: data.id };
  } catch (error: unknown) {
    handleApiError(error, 'Failed to save research');
  }
};

export async function getResearchHistory(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('research')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: unknown) {
    handleApiError(error, 'Failed to get research history');
  }
};
