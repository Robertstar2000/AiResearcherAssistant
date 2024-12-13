import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { ResearchException, ResearchError } from './researchErrors';

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
  } catch (error) {
    console.error('Error in generateSection:', error);
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

    const outline = response.choices[0].message.content.trim();
    
    // Parse and count sections AFTER outline is generated
    const lines = outline.split('\n');
    let sectionCount = 0;
    let lastSectionNumber = 0;
    let lastSectionLetter = '';
    let lastRomanNumeral = '';
    
    // Helper function to convert roman numeral to number
    const romanToInt = (roman: string): number => {
      const romanMap: { [key: string]: number } = {
        'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
      };
      let result = 0;
      for (let i = 0; i < roman.length; i++) {
        const current = romanMap[roman[i]];
        const next = romanMap[roman[i + 1]];
        if (next > current) {
          result += next - current;
          i++;
        } else {
          result += current;
        }
      }
      return result;
    };
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Match numbered sections (1., 2.), lettered sections (A., B., a., b.), or roman numerals (I., II., III.)
      const numberMatch = trimmedLine.match(/^(\d+)\./);
      const letterMatch = trimmedLine.match(/^([A-Za-z])\./);
      const romanMatch = trimmedLine.match(/^([IVXLCDM]+)\./);
      
      if (numberMatch) {
        const currentNumber = parseInt(numberMatch[1]);
        if (currentNumber > lastSectionNumber) {
          sectionCount++;
          lastSectionNumber = currentNumber;
          lastSectionLetter = '';
          lastRomanNumeral = '';
        }
      } else if (letterMatch) {
        const currentLetter = letterMatch[1].toLowerCase();
        if (currentLetter > lastSectionLetter || lastSectionLetter === '') {
          sectionCount++;
          lastSectionLetter = currentLetter;
          lastSectionNumber = 0;
          lastRomanNumeral = '';
        }
      } else if (romanMatch) {
        const currentRoman = romanMatch[1].toUpperCase();
        const currentValue = romanToInt(currentRoman);
        const lastValue = lastRomanNumeral ? romanToInt(lastRomanNumeral) : 0;
        
        if (currentValue > lastValue) {
          sectionCount++;
          lastRomanNumeral = currentRoman;
          lastSectionNumber = 0;
          lastSectionLetter = '';
        }
      }
    }
    
    // Validate section count after parsing
    if (sectionCount < min || sectionCount > max) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        `Generated outline has ${sectionCount} sections, but must be between ${min} and ${max} sections. Regenerating...`
      );
    }

    if (!sectionCount) {
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'Generated outline does not follow the required format. Each section must start with a number or letter followed by a dot.'
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
