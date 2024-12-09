import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import { ResearchException, ResearchError } from './researchErrors'

// API Configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_KEY

// Debug environment variables
console.log('Environment Variables Check:')
console.log('VITE_SUPABASE_URL exists:', !!supabaseUrl)
console.log('VITE_SUPABASE_KEY exists:', !!supabaseKey)
console.log('VITE_SUPABASE_URL value:', supabaseUrl)
console.log('VITE_SUPABASE_KEY value:', supabaseKey ? `${supabaseKey.substring(0, 5)}...` : 'undefined')
console.log('process.env:', process.env)
console.log('import.meta.env:', import.meta.env)

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables. Please check your Netlify environment settings.')
  console.error('Make sure VITE_SUPABASE_URL and VITE_SUPABASE_KEY are set in Netlify environment variables.')
  throw new ResearchException(
    ResearchError.CONFIGURATION_ERROR,
    'Application configuration error. Please contact support.'
  )
}

// Initialize Supabase client with additional options
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
})

// GROQ Configuration
const GROQ_API_KEY = process.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GROQ_API_KEY
if (!GROQ_API_KEY) {
  throw new Error('Missing GROQ API key. Please check your .env file.')
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export const GROQ_CONFIG = {
  MODEL: 'mixtral-8x7b-32768',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 2048,
} as const;

let lastApiCallTime = 0;

// API Types
interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  temperature: number;
  max_tokens: number;
}

interface ResearchSection {
  title: string;
  content: string;
  number: string;
  warning?: string;
}

// Helper Functions
export const waitBetweenCalls = async (retryCount = 0): Promise<void> => {
  const currentTime = Date.now();
  const timeSinceLastCall = currentTime - lastApiCallTime;
  const baseDelay = 1000;
  const retryDelay = retryCount * 2000;
  const totalDelay = Math.max(0, baseDelay - timeSinceLastCall + retryDelay);

  if (totalDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, totalDelay));
  }
  lastApiCallTime = currentTime;
};

// API Call Functions
async function makeGroqApiCall(
  prompt: string,
  maxTokens: number = GROQ_CONFIG.MAX_TOKENS,
  systemPrompt?: string
): Promise<GroqResponse> {
  const messages: GroqMessage[] = systemPrompt 
    ? [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    : [{ role: 'user', content: prompt }];

  const request: GroqRequest = {
    model: GROQ_CONFIG.MODEL,
    messages,
    temperature: GROQ_CONFIG.TEMPERATURE,
    max_tokens: maxTokens,
  };

  const response = await axios.post<GroqResponse>(
    GROQ_API_URL,
    request,
    {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

const handleApiError = (error: unknown, message: string) => {
  if (error instanceof Error) {
    throw new ResearchException(ResearchError.API_ERROR, message, { originalError: error.message })
  }
  throw new ResearchException(ResearchError.API_ERROR, message)
};

const makeApiCall = async <T>(
  callFn: () => Promise<T>,
  errorMsg: string,
  retryCount = 0
): Promise<T> => {
  try {
    if (!GROQ_API_KEY) {
      throw new ResearchException(
        ResearchError.API_ERROR,
        'API key is not configured'
      );
    }

    await waitBetweenCalls(retryCount);
    return await callFn();
  } catch (error) {
    throw handleApiError(error, errorMsg);
  }
};

// Generate research content
export const generateTitle = async (query: string): Promise<string> => {
  const systemPrompt = 'You are a research title generator. Generate a clear, concise, and academic title for the given research topic.';
  const prompt = `Generate a research title for the following topic: ${query}`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, 50, systemPrompt),
      'Failed to generate title'
    );
    return response.choices[0].message.content.trim();
  } catch (error) {
    if (error instanceof ResearchException) throw error;
    throw new ResearchException(
      ResearchError.API_ERROR,
      `Failed to generate title: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

export const generateSection = async (
  topic: string,
  sectionTitle: string,
  isSubsection = false
): Promise<ResearchSection> => {
  try {
    const minWords = isSubsection ? 150 : 300;
    const systemPrompt = `You are a research content generator. Generate detailed, academic content for the given section. Minimum length: ${minWords} words.`;
    const prompt = `Generate content for the section "${sectionTitle}" in research about "${topic}".`;

    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate section'
    );

    const content = response.choices[0].message.content.trim();
    const wordCount = content.split(/\s+/).length;

    return {
      title: sectionTitle,
      content,
      number: '1', // This will be set by the parent function
      ...(wordCount < minWords && { warning: `Generated content (${wordCount} words) is shorter than requested (${minWords} words).` })
    };
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
};

export const generateSectionBatch = async (
  title: string,
  sections: Array<{ sectionTitle: string; prompt: string }>
): Promise<string[]> => {
  try {
    const sectionPrompts = sections.map(section => 
      `${section.sectionTitle}\n${section.prompt}`
    ).join('\n\n');
    
    const response = await makeApiCall(
      () => makeGroqApiCall(`${title}\n\n${sectionPrompts}`),
      'Failed to generate section batch'
    );
    return [response.choices[0].message.content.trim()];
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
};

export const searchPapers = async (query: string): Promise<any[]> => {
  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(query),
      'Failed to search papers'
    );
    return [response.choices[0].message.content.trim()];
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
};

export async function generateReferences(topic: string): Promise<string[]> {
  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(topic),
      'Failed to generate references'
    );
    return [response.choices[0].message.content.trim()];
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
};

// Supabase database operations
export async function saveResearch(researchData: any): Promise<{ id: string }> {
    try {
        const { data, error } = await supabase
            .from('research')
            .insert([researchData])
            .select('id')
            .single();

        if (error) throw error;
        return { id: data.id };
    } catch (error) {
        throw new ResearchException(
            ResearchError.API_ERROR,
            error instanceof Error ? error.message : 'Unknown error'
        );
    }
}

export async function getResearchHistory(userId: string): Promise<any[]> {
    try {
        const { data, error } = await supabase
            .from('research')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    } catch (error) {
        throw new ResearchException(
            ResearchError.API_ERROR,
            error instanceof Error ? error.message : 'Unknown error'
        );
    }
}

export async function generateOutline(topic: string): Promise<string> {
    try {
        const response = await makeApiCall(
            () => makeGroqApiCall(topic),
            'Failed to generate outline'
        );
        return response.choices[0].message.content.trim();
    } catch (error) {
        throw new ResearchException(
            ResearchError.API_ERROR,
            error instanceof Error ? error.message : 'Unknown error'
        );
    }
};

export async function generateDetailedOutline(topic: string): Promise<string> {
  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(topic),
      'Failed to generate detailed outline'
    );
    return response.choices[0].message.content.trim();
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
};

export function parseSectionsFromOutline(outline: string): string[] {
  const sections: string[] = [];
  const lines = outline.split('\n').map((line: string) => line.trim());
  
  for (const line of lines) {
    if (/^\d+\./.test(line)) {
      sections.push(line);
    }
  }
  
  return sections;
};
