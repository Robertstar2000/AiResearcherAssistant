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
  const delay = GROQ_CONFIG.BASE_DELAY * Math.pow(2, retryCount);
  console.log(`Waiting ${delay/1000} seconds before next call...`);
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

const handleApiError = (error: unknown, message: string) => {
  if (error instanceof ResearchException) {
    throw error; // Re-throw ResearchException as is
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 429) {
      throw new ResearchException(
        ResearchError.RATE_LIMIT_ERROR,
        'API rate limit exceeded. Please wait before trying again.',
        { originalError: error }
      );
    }
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
    if (retryCount > 0) {
      await waitBetweenCalls(retryCount - 1);
    }
    const result = await callFn();
    return result;
  } catch (error) {
    if (error instanceof ResearchException && error.code === ResearchError.RATE_LIMIT_ERROR) {
      if (retryCount < GROQ_CONFIG.MAX_RETRIES) {
        console.log(`Rate limit hit, waiting before retry ${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES}`);
        await waitBetweenCalls(retryCount);
        return makeApiCall(callFn, errorMsg, retryCount + 1);
      }
    }
    if (retryCount < GROQ_CONFIG.MAX_RETRIES) {
      console.log(`Error, retrying ${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES}`);
      return makeApiCall(callFn, errorMsg, retryCount + 1);
    }
    handleApiError(error, errorMsg);
    throw error;
  }
};

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
    const systemPrompt = `You are a research content generator. Generate detailed, academic content in post graduate level language for the given section. The content must be at least ${minWords} words long. If you cannot generate the full content in one response, focus on providing a complete and coherent portion that can be expanded later.`;
    const prompt = `Generate comprehensive academic content for the section "${sectionTitle}" in research about "${topic}". The content should be at least ${minWords} words long and maintain high academic standards.`;

    // Always wait 20 seconds before generating a section
    await new Promise(resolve => setTimeout(resolve, 20000));
    console.log(`Starting generation for section "${sectionTitle}" after 20-second delay`);

    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      `Failed to generate section "${sectionTitle}"`,
      retryCount
    );

    const content = response.choices[0].message.content.trim();
    const wordCount = content.split(/\s+/).length;

    // If content is too short and we haven't exceeded max retries, try again
    if (wordCount < minWords && retryCount < GROQ_CONFIG.MAX_RETRIES) {
      console.log(`Generated content too short (${wordCount}/${minWords} words) for "${sectionTitle}". Retrying... (${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES})`);
      await waitBetweenCalls(retryCount);
      return generateSection(topic, sectionTitle, isSubsection, retryCount + 1);
    }

    return {
      title: sectionTitle,
      content,
      number: '1', // Will be updated by the calling function
      warning: wordCount < minWords ? `Content length (${wordCount} words) is below the minimum requirement of ${minWords} words.` : undefined
    };
  } catch (error) {
    if (error instanceof ResearchException && error.code === ResearchError.RATE_LIMIT_ERROR) {
      if (retryCount < GROQ_CONFIG.MAX_RETRIES) {
        console.log(`Rate limit hit for "${sectionTitle}". Retrying... (${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES})`);
        await waitBetweenCalls(retryCount);
        return generateSection(topic, sectionTitle, isSubsection, retryCount + 1);
      }
    }
    console.error(`Failed to generate section "${sectionTitle}":`, error);
    throw new ResearchException(
      error instanceof ResearchException ? error.code : ResearchError.API_ERROR,
      `Failed to generate section "${sectionTitle}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error, sectionTitle, topic, isSubsection }
    );
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

export const generateReferences = async (topic: string): Promise<string[]> => {
  const systemPrompt = 'You are a research reference generator. Generate academic use post graduate language references for the given research topic.';
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

export const generateDetailedOutline = async (topic: string, mode: string = 'article'): Promise<string> => {
  try {
    const systemPrompt = 'You are a research outline generator. Generate a detailed outline following the specified mode and requirements.';
    
    let prompt = `Generate a detailed outline for research about: ${topic}\n\n`;
    
    switch(mode.toLowerCase()) {
      case 'article':
        prompt += `Create a popular science level article with:
1. 3-6 main sections
2. Each section must be unique and engaging
3. Must be written at a popular science level
4. Must maintain academic rigor while being accessible
5. Format with main sections (1., 2., etc.)`;
        break;
        
      case 'basic-literature':
        prompt += `Create a basic literature review with:
1. 9-15 main sections
2. Must start with abstract and end with conclusion
3. Focus on synthesis and research gaps
4. Format with main sections (1., 2., etc.)
5. Each section must be unique and based on the topic
6. Make it technical at a post graduate level`;
        break;
        
      case 'basic-general':
        prompt += `Create a basic general research outline with:
1. 9-15 main sections
2. Must start with abstract and end with conclusion
3. Flexible structure for topic exploration
4. Format with main sections (1., 2., etc.)
5. Each section must be unique and focused on the topic
6. Make it technical at a post graduate level`;
        break;
        
      case 'basic-experimental':
        prompt += `Create a basic experimental design outline with:
1. 9-15 main sections
2. Must start with abstract and end with summary
3. Focus on using a hypothisis to design an experimental methodology 
4. Format with main sections (1., 2., etc.)
5. Each section must be unique and methodologically sound
6. Make it technical at a post graduate level`;
        break;
        
      case 'advanced-literature':
        prompt += `Create an advanced literature review with:
1. 12-24 main sections
2. 3-6 subsections per main section
3. Must start with abstract and end with conclusion
4. Deep analysis of research synthesis and gaps
5. Format with main sections (1., 2., etc.) and subsections (a., b., etc.)
6. Each section and subsection must be unique and comprehensive
7. Make it technical at a post graduate level`;
        break;
        
      case 'advanced-general':
        prompt += `Create an advanced general research outline with:
1. 12-24 main sections
2. 3-6 subsections per main section
3. Must start with abstract and end with conclusion
4. In-depth exploration of all topic aspects
5. Format with main sections (1., 2., etc.) and subsections (a., b., etc.)
6. Each section and subsection must be unique and detailed
7. Make it technical at a post graduate level`;
        break;
        
      case 'advanced-experimental':
        prompt += `Create an advanced experimental design outline with:
1. 12-24 main sections
2. 3-6 subsections per main section
3. Must start with abstract and end with summary
4. Start with a clear hypothesis about: ${topic}
5. Design a comprehensive experiment to prove the hypothesis
6. Format with main sections (1., 2., etc.) and subsections (a., b., etc.)
7. Each section and subsection must be unique and methodologically rigorous
8. Make it technical at a post graduate level`;
        break;
    }

    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      'Failed to generate detailed outline',
      3
    );

    const outline = response.choices[0].message.content.trim();
    if (!outline) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'Generated outline is empty',
        { topic }
      );
    }

    return outline;
  } catch (error) {
    console.error('Error generating detailed outline:', error);
    throw new ResearchException(
      ResearchError.API_ERROR,
      `Failed to generate detailed outline: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error, topic }
    );
  }
};

// This function is deprecated. Use parseDetailedOutline from researchService.ts instead
export const parseSectionsFromOutline = (outline: string): string[] => {
  console.warn('Warning: parseSectionsFromOutline is deprecated. Use parseDetailedOutline from researchService.ts instead');
  try {
    if (!outline || typeof outline !== 'string') {
      throw new Error('Invalid outline: must be a non-empty string');
    }

    const lines = outline.split('\n');
    const sections: string[] = [];
    let currentSection = '';

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      // Check if line starts with a number (main section) or letter (subsection)
      const isMainSection = /^\d+\./.test(line.trim());
      const isSubSection = /^[a-z]\.|\([a-z]\)/.test(line.trim().toLowerCase());

      if (isMainSection || isSubSection) {
        if (currentSection) {
          sections.push(currentSection.trim());
        }
        currentSection = line.trim();
      } else {
        // If it's a continuation of the current section, append it
        currentSection = currentSection ? `${currentSection} ${line.trim()}` : line.trim();
      }
    }

    // Add the last section if it exists
    if (currentSection) {
      sections.push(currentSection.trim());
    }

    if (sections.length === 0) {
      throw new Error('No sections found in outline');
    }

    return sections;
  } catch (error) {
    console.error('Error parsing outline:', error);
    throw new ResearchException(
      ResearchError.PARSING_ERROR,
      `Failed to parse outline: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error, outline }
    );
  }
};
