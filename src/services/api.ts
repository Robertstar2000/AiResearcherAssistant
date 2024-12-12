import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { ResearchException, ResearchError } from './researchErrors';

// API Configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_KEY;
const GROQ_API_KEY = process.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = process.env.VITE_GROQ_API_URL || import.meta.env.VITE_GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  throw new ResearchException(
    ResearchError.CONFIGURATION_ERROR,
    'Application configuration error. Please check your environment variables.'
  );
}

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
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
  MAX_TOKENS: 32000,
  MAX_RETRIES: 3,
  BASE_DELAY: 20000 // 20 seconds base delay
};

// API Types
interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

// Helper Functions
const waitBetweenCalls = async (retryCount = 0): Promise<void> => {
  const delay = GROQ_CONFIG.BASE_DELAY * Math.pow(2, retryCount);
  await new Promise(resolve => setTimeout(resolve, delay));
};

// API Call Functions
async function makeGroqApiCall(
  prompt: string,
  maxTokens: number = GROQ_CONFIG.MAX_TOKENS,
  systemPrompt?: string
): Promise<any> {
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
    console.log('Making API call to GROQ...');
    const response = await axios.post(GROQ_CONFIG.API_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('API call successful');
    return response.data;
  } catch (error) {
    console.error('API call failed:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new ResearchException(
          ResearchError.RATE_LIMIT_ERROR,
          'API rate limit exceeded',
          { originalError: error }
        );
      }
      throw new ResearchException(
        ResearchError.API_ERROR,
        `API call failed: ${error.response?.data?.error?.message || error.message}`,
        { originalError: error }
      );
    }
    throw new ResearchException(
      ResearchError.API_ERROR,
      'API call failed',
      { originalError: error }
    );
  }
};

function handleApiError(error: unknown, message: string): never {
  console.error(message, error);
  if (error instanceof ResearchException) {
    throw error;
  }
  throw new ResearchException(ResearchError.API_ERROR, message);
};

async function makeApiCall<T>(
  apiFunction: () => Promise<T>,
  errorMessage: string,
  retryCount: number = 0
): Promise<T> {
  try {
    if (retryCount > 0) {
      await waitBetweenCalls(retryCount - 1);
    }
    const result = await apiFunction();
    return result;
  } catch (error) {
    if (error instanceof ResearchException && error.code === ResearchError.RATE_LIMIT_ERROR) {
      if (retryCount < GROQ_CONFIG.MAX_RETRIES) {
        console.log(`Rate limit hit, waiting before retry ${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES}`);
        await waitBetweenCalls(retryCount);
        return makeApiCall(apiFunction, errorMessage, retryCount + 1);
      }
    }
    if (retryCount < GROQ_CONFIG.MAX_RETRIES) {
      console.log(`Error, retrying ${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES}`);
      return makeApiCall(apiFunction, errorMessage, retryCount + 1);
    }
    handleApiError(error, errorMessage);
    throw error;
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
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

export async function generateSection(
  topic: string,
  sectionTitle: string,
  isSubsection: boolean = false,
  ref: Partial<SectionRef> = { retryCount: 0 }
): Promise<string> {
  try {
    const minWords = isSubsection ? 2000 : 3000;
    const systemPrompt = `You are a research content generator. Generate detailed, academic content in post graduate level language for the given section. The content must be at least ${minWords} words long. If you cannot generate the full content in one response, focus on providing a complete and coherent portion that can be expanded later.`;

    const prompt = `Generate detailed academic content for the section "${sectionTitle}" of a research paper about "${topic}".
The content should be thorough, well-researched, and maintain a formal academic tone.`;

    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      `Failed to generate section "${sectionTitle}"`,
      ref.retryCount || 0
    );

    const content = response.choices[0].message.content.trim();
    const wordCount = content.split(/\s+/).length;

    // If content is too short and we haven't exceeded max retries, try again
    if (wordCount < minWords && (ref.retryCount || 0) < GROQ_CONFIG.MAX_RETRIES) {
      console.log(`Generated content too short (${wordCount}/${minWords} words) for "${sectionTitle}". Retrying... (${(ref.retryCount || 0) + 1}/${GROQ_CONFIG.MAX_RETRIES})`);
      await waitBetweenCalls(ref.retryCount || 0);
      return generateSection(topic, sectionTitle, isSubsection, { retryCount: (ref.retryCount || 0) + 1 });
    }

    return content;
  } catch (error) {
    if (error instanceof ResearchException && error.code === ResearchError.RATE_LIMIT_ERROR) {
      if ((ref.retryCount || 0) < GROQ_CONFIG.MAX_RETRIES) {
        console.log(`Rate limit hit for "${sectionTitle}". Retrying... (${(ref.retryCount || 0) + 1}/${GROQ_CONFIG.MAX_RETRIES})`);
        await waitBetweenCalls(ref.retryCount || 0);
        return generateSection(topic, sectionTitle, isSubsection, { retryCount: (ref.retryCount || 0) + 1 });
      }
    }
    console.error(`Failed to generate section "${sectionTitle}":`, error);
    throw error;
  }
};

export async function generateSectionBatch(
  sections: Array<{ sectionTitle: string; prompt: string }>
): Promise<string[]> {
  try {
    if (!sections || sections.length === 0) {
      throw new ResearchException(
        ResearchError.VALIDATION_FAILED,
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
      } catch (error) {
        console.error(`Error generating batch section "${section.sectionTitle}":`, error);
        throw new ResearchException(
          ResearchError.API_ERROR,
          `Failed to generate section "${section.sectionTitle}": ${error instanceof Error ? error.message : 'Unknown error'}`,
          { originalError: error, section }
        );
      }
    }

    return results;
  } catch (error) {
    throw new ResearchException(
      error instanceof ResearchException ? error.code : ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Failed to generate section batch',
      { error, sections }
    );
  }
};

export async function searchPapers(searchQuery: string): Promise<any[]> {
  try {
    // Implement paper search functionality
    return [];
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Failed to search papers',
      { error, searchQuery }
    );
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
  } catch (error) {
    if (error instanceof ResearchException && error.code === ResearchError.RATE_LIMIT_ERROR) {
      if ((ref.retryCount || 0) < GROQ_CONFIG.MAX_RETRIES) {
        console.log(`Rate limit hit while generating references. Retrying...`);
        await waitBetweenCalls(ref.retryCount || 0);
        return generateReferences(topic, { retryCount: (ref.retryCount || 0) + 1 });
      }
    }
    console.error('Failed to generate references:', error);
    throw error;
  }
}

export async function generateDetailedOutline(
  topic: string,
  mode: string = 'basic',
  type: string = 'general'
): Promise<string> {
  const systemPrompt = `You are a research outline generator. Generate a detailed outline for a ${mode} ${type} research paper.

Instructions for Outline Generation:
1. Structure Requirements:
   - Create a clear, hierarchical structure
   - Use numbers for main sections (1., 2., etc.)
   - Use letters for subsections (a., b., etc.)
   - For basic mode: Include 5-7 main sections with 2-3 subsections each
   - For advanced mode: Include 7-9 main sections with 3-4 subsections each

2. Content Requirements:
   - EVERY section and subsection MUST include a brief description (1-2 lines) of what it will cover
   - Descriptions should be specific and actionable
   - Ensure logical flow between sections
   - Each section should clearly relate to the research topic

3. Formatting Requirements:
   - Main sections: "1. Section Title" followed by description on next line
   - Subsections: "a. Subsection Title" followed by description on next line
   - Indent subsections under their main section
   - Leave a blank line between sections`;

  const prompt = `Generate a detailed outline for a ${mode} ${type} research paper about: ${topic}

Requirements:
1. Follow academic standards for a ${type} research paper
2. Include all standard sections (Introduction, Methodology, Results, etc.)
3. Each section and subsection MUST have a description of its content
4. Basic mode: 5-7 main sections, 2-3 subsections each (total ~15-21 sections)
5. Advanced mode: 7-9 main sections, 3-4 subsections each (total ~21-36 sections)
6. Technical papers: Include methodology and implementation sections
7. Literature reviews: Focus on analysis and synthesis sections

Format Example:
1. Introduction
   [Brief description of what the introduction will cover]
   
   a. Background
   [Specific description of the background subsection content]
   
   b. Research Objectives
   [Clear description of what the objectives subsection will address]

2. Methodology
   [Overview of the methodology section's content]
   ...`;

  try {
    const response = await makeGroqApiCall(prompt, 2000, systemPrompt);
    if (!response?.choices?.[0]?.message?.content) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'Failed to generate outline'
      );
    }

    return response.choices[0].message.content.trim();
  } catch (error) {
    handleApiError(
      error,
      'Failed to generate detailed outline'
    );
    throw error;
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
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
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
  } catch (error) {
    throw new ResearchException(
      ResearchError.API_ERROR,
      error instanceof Error ? error.message : 'Unknown error',
      { originalError: error }
    );
  }
};

// Re-export error types
export { ResearchException, ResearchError } from './researchErrors';
