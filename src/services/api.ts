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
  throw new ResearchException(
    ResearchError.API_ERROR,
    message
  );
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
  sectionDescription: string,
  isSubsection: boolean,
  outline: OutlineItem[]
): Promise<string> {
  const outlineContext = outline
    .map(item => `${item.number}. ${item.title}: ${item.description}`)
    .join('\n');

  const prompt = `
Generate detailed content for the following section of a research paper:

Topic: ${topic}
Section: ${sectionTitle}
Description: ${sectionDescription}
Type: ${isSubsection ? 'Subsection' : 'Main Section'}

Full Outline Context:
${outlineContext}

Please generate comprehensive, academic-quality content for this specific section that:
1. Directly addresses the section title and description
2. Maintains proper flow with other sections
3. Uses academic language and proper citations
4. Provides detailed analysis and examples where appropriate
5. Stays focused on the section's specific topic while maintaining context with the overall research

Generate the content now:`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(prompt, GROQ_CONFIG.MAX_TOKENS),
      `Failed to generate section "${sectionTitle}"`,
      GROQ_CONFIG.MAX_RETRIES
    );

    const content = response.choices[0].message.content.trim();
    const wordCount = content.split(/\s+/).length;

    // If content is too short and we haven't exceeded max retries, try again
    if (wordCount < 2000 && GROQ_CONFIG.MAX_RETRIES > 0) {
      console.log(`Generated content too short (${wordCount}/2000 words) for "${sectionTitle}". Retrying... (${GROQ_CONFIG.MAX_RETRIES})`);
      await waitBetweenCalls(GROQ_CONFIG.MAX_RETRIES - 1);
      return generateSection(topic, sectionTitle, sectionDescription, isSubsection, outline);
    }

    return content;
  } catch (error) {
    if (error instanceof ResearchException && error.code === ResearchError.RATE_LIMIT_ERROR) {
      if (GROQ_CONFIG.MAX_RETRIES > 0) {
        console.log(`Rate limit hit for "${sectionTitle}". Retrying... (${GROQ_CONFIG.MAX_RETRIES})`);
        await waitBetweenCalls(GROQ_CONFIG.MAX_RETRIES - 1);
        return generateSection(topic, sectionTitle, sectionDescription, isSubsection, outline);
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
  // Define section count based on research mode and type combination
  const sectionCounts = {
    basic: {
      general: { min: 8, max: 12 },
      Literature: { min: 6, max: 10 },
      Experement: { min: 8, max: 12 },
    },
    advanced: {
      general: { min: 18, max: 25 },
      Literature: { min: 10, max: 15 },
      Experement: { min: 18, max: 25 },
    },
    artical: {
      general: { min: 3, max: 5 },
      Literature: { min: 3, max: 5 },
      Experement: { min: 3, max: 5 },
    },
  };

  const { min, max } = sectionCounts[mode as keyof typeof sectionCounts]?.[type as keyof (typeof sectionCounts)['basic']] 
    || sectionCounts.basic.general;

  // Define research type requirements
  const typeRequirements = {
    general: 'Focus on providing a comprehensive overview with balanced coverage of all aspects.',
    Literature: 'Provide extensive literature review and synthesis of existing research.',
    Experement: 'Focus on experimental design, methodology, and results analysis.'
  };

  const requirement = typeRequirements[type as keyof typeof typeRequirements] || typeRequirements.general;

  const systemPrompt = `You are an expert research outline generator. Create a detailed, well-structured outline for a ${mode} level research paper about "${topic}". 
The outline should follow these requirements:

1. Structure:
   - YOU MUST INCLUDE EXACTLY ${min}-${max} MAIN SECTIONS (numbered 1., 2., etc.)
   - Each section must have descriptive bullet points explaining what content will be covered
   - Maintain logical flow and progression of ideas
   - Ensure comprehensive coverage of the topic
   - IMPORTANT: The outline MUST have at least ${min} and at most ${max} numbered sections

2. Content Requirements:
   - ${requirement}
   - Each section should build upon previous sections
   - Include both theoretical and practical aspects where applicable
   - Consider current research trends and developments

3. Format Requirements:
   - Use numbers for main sections (1., 2., etc.)
   - Use bullet points (•) for section descriptions
   - Each section MUST have multiple descriptive bullet points
   - Make descriptions specific and actionable for content generation
   - IMPORTANT: Each section MUST start with a number followed by a dot (e.g., "1.", "2.", etc.)
   - Each section MUST start on a new line

4. Special Considerations for ${mode} mode:
   ${mode === 'basic' ? '- Focus on fundamental concepts and clear explanations\n   - Avoid overly technical language\n   - Emphasize practical applications' :
     mode === 'advanced' ? '- Include detailed technical discussions\n   - Cover advanced concepts and methodologies\n   - Incorporate current research findings' :
     '- Focus on concise presentation\n   - Highlight key findings\n   - Maintain article format standards'}

IMPORTANT: Your outline MUST contain at least ${min} and at most ${max} numbered sections. Each section MUST start with a number followed by a dot (e.g., "1.", "2.", etc.) and MUST start on a new line.

Generate a detailed outline now, ensuring each section has clear, specific bullet points describing what content should be covered.`;

  try {
    const response = await makeApiCall(
      () => makeGroqApiCall(topic, GROQ_CONFIG.MAX_TOKENS, systemPrompt),
      `Failed to generate outline for "${topic}"`,
      0
    );

    const outline = response.choices[0].message.content.trim();
    
    // Split into lines and count sections that start with a number and dot
    const lines = outline.split('\n');
    const sectionCount = lines.filter((line: string) => /^\d+\./.test(line.trim())).length;

    // Validate section count
    if (sectionCount < min || sectionCount > max) {
      console.log('Generated outline:', outline); // For debugging
      console.log(`Found ${sectionCount} sections in outline`); // For debugging
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        `Generated outline has ${sectionCount} sections, but should have between ${min} and ${max} sections. Regenerating...`
      );
    }

    // Validate format of each section
    const hasValidSections = lines.some((line: string) => /^\d+\./.test(line.trim()));
    if (!hasValidSections) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'Generated outline does not follow the required format. Each section must start with a number followed by a dot.'
      );
    }

    return outline;
  } catch (error) {
    console.error('Error in generateDetailedOutline:', error);
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
