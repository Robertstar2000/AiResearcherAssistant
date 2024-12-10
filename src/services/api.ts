import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { ResearchException, ResearchError } from './researchErrors';

// API Configuration
const GROQ_CONFIG = {
  API_URL: 'https://api.groq.com/v1/completions',
  API_KEY: process.env.GROQ_API_KEY || '',
  MODEL: 'mixtral-8x7b-32768',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 32000,
};

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

export interface ResearchSection {
  title: string;
  content: string;
  number: string;
  warning?: string;
}

// Helper Functions
const waitBetweenCalls = async (retryCount = 0): Promise<void> => {
  const baseDelay = 1000;
  const delay = baseDelay * Math.pow(2, retryCount);
  await new Promise(resolve => setTimeout(resolve, delay));
};

// API Call Functions
const makeGroqApiCall = async (
  prompt: string,
  maxTokens: number = GROQ_CONFIG.MAX_TOKENS,
  systemPrompt?: string
): Promise<GroqResponse> => {
  const messages: GroqMessage[] = [];
  
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    });
  }
  
  messages.push({
    role: 'user',
    content: prompt
  });

  const requestData: GroqRequest = {
    model: GROQ_CONFIG.MODEL,
    messages: messages,
    temperature: GROQ_CONFIG.TEMPERATURE,
    max_tokens: maxTokens
  };

  try {
    const response = await axios.post(GROQ_CONFIG.API_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      'API call failed',
      { originalError: error }
    );
  }
};

const handleApiError = (error: unknown, message: string) => {
  if (axios.isAxiosError(error)) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      `${message}: ${error.message}`,
      { originalError: error }
    );
  }
  throw error;
};

const makeApiCall = async <T>(
  callFn: () => Promise<T>,
  errorMsg: string,
  retryCount = 0
): Promise<T> => {
  try {
    const result = await callFn();
    return result;
  } catch (error) {
    if (retryCount < 3) {
      await waitBetweenCalls(retryCount);
      return makeApiCall(callFn, errorMsg, retryCount + 1);
    }
    handleApiError(error, errorMsg);
    throw error;
  }
};

// Generate research content
export const generateTitle = async (query: string): Promise<string> => {
  const systemPrompt = 'You are a research title generator. Generate a clear, concise, and academic title for the given research topic.';
  const prompt = `Generate a one sentence research title for the following topic: ${query}`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate title'
    );
    return response.choices[0].message.content.trim();
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export const generateSection = async (
  topic: string,
  sectionTitle: string,
  isSubsection = false,
  retryCount = 0
): Promise<ResearchSection> => {
  try {
    const minWords = isSubsection ? 2000 : 3000;
    const maxRetries = 3;
    const systemPrompt = `You are a research content generator. Generate detailed, academic content in post graduate level language for the given section. The content must be at least ${minWords} words long. If you cannot generate the full content in one response, focus on providing a complete and coherent portion that can be expanded later.`;
    const prompt = `Generate comprehensive academic content for the section "${sectionTitle}" in research about "${topic}". The content should be at least ${minWords} words long and maintain high academic standards.`;

    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate section'
    );

    const content = response.choices[0].message.content.trim();
    const wordCount = content.split(/\s+/).length;

    // If content is too short and we haven't exceeded max retries, try again
    if (wordCount < minWords && retryCount < maxRetries) {
      console.log(`Generated content too short (${wordCount}/${minWords} words). Retrying... (${retryCount + 1}/${maxRetries})`);
      return generateSection(topic, sectionTitle, isSubsection, retryCount + 1);
    }

    return {
      title: sectionTitle,
      content,
      number: '1', // This will be set by the parent function
      ...(wordCount < minWords && { 
        warning: `Generated content (${wordCount} words) is shorter than requested (${minWords} words). This may be due to API token limits.`
      })
    };
  } catch (error) {
    if (retryCount < maxRetries) {
      console.log(`Error generating section. Retrying... (${retryCount + 1}/${maxRetries})`);
      return generateSection(topic, sectionTitle, isSubsection, retryCount + 1);
    }
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export const generateSectionBatch = async (
  title: string,
  sections: Array<{ sectionTitle: string; prompt: string }>
): Promise<string[]> => {
  const results: string[] = [];
  for (const section of sections) {
    try {
      const response = await makeApiCall(
        () => makeGroqApiCall(section.prompt),
        'Failed to generate section batch'
      );
      results.push(response.choices[0].message.content.trim());
    } catch (error) {
      throw new ResearchException(
        ResearchError.API_ERROR,
        error instanceof Error ? error.message : 'Unknown error',
        { originalError: error }
      );
    }
  }
  return results;
};

export const searchPapers = async (query: string): Promise<any[]> => {
  try {
    // Implement paper search functionality
    return [];
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export const generateReferences = async (topic: string): Promise<string[]> => {
  const systemPrompt = 'You are a research reference generator. Generate academic references for the given research topic.';
  const prompt = `Generate a list of academic references for research about: ${topic}`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate references'
    );
    return response.choices[0].message.content
      .trim()
      .split('\n')
      .filter(ref => ref.trim().length > 0);
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

// Supabase database operations
export const saveResearch = async (researchData: any): Promise<{ id: string }> => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || ''
    );

    const { data, error } = await supabase
      .from('research')
      .insert(researchData)
      .select('id')
      .single();

    if (error) throw error;
    return { id: data.id };
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export const getResearchHistory = async (userId: string): Promise<any[]> => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || ''
    );

    const { data, error } = await supabase
      .from('research')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export const generateOutline = async (topic: string): Promise<string> => {
  const systemPrompt = 'You are a research outline generator. Generate a detailed outline for the given research topic.';
  const prompt = `Generate a detailed outline for research about: ${topic}

Please format the outline with:
1. Main sections numbered (1., 2., etc.)
2. Subsections lettered (a., b., etc.)
3. Include brief descriptions of what each section will cover
4. Ensure logical flow and progression of ideas
5. Include standard research paper sections (Introduction, Methodology, Results, Discussion, Conclusion)`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate outline'
    );
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating outline:', error);
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export const generateDetailedOutline = async (topic: string): Promise<string> => {
  try {
    const outline = await generateOutline(topic);
    return outline;
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export const parseSectionsFromOutline = (outline: string): string[] => {
  try {
    const lines = outline.split('\n');
    const sections: string[] = [];
    let currentSection = '';

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      // Check if line starts with a number (main section) or letter (subsection)
      const isMainSection = /^\d+\./.test(line.trim());
      const isSubSection = /^[a-z]\.|\([a-z]\)/.test(line.trim().toLowerCase());

      if (isMainSection) {
        if (currentSection) {
          sections.push(currentSection.trim());
        }
        currentSection = line.trim();
      } else if (isSubSection) {
        if (currentSection) {
          sections.push(currentSection.trim());
        }
        currentSection = line.trim();
      } else {
        // If it's a continuation of the current section, append it
        if (currentSection) {
          currentSection += ' ' + line.trim();
        } else {
          currentSection = line.trim();
        }
      }
    }

    // Add the last section if it exists
    if (currentSection) {
      sections.push(currentSection.trim());
    }

    return sections;
  } catch (error) {
    throw new ResearchException(
      ResearchError.PARSING_ERROR,
      'Failed to parse outline: ' + (error instanceof Error ? error.message : 'Unknown error'),
      { originalError: error }
    );
  }
};
