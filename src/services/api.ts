import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { z } from 'zod'; // Added for enhanced type validation

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const TOKEN_RATE_LIMIT = 250000; // tokens per minute
const MAX_TOKENS_PER_REQUEST = 8000;
const SAFETY_FACTOR = 1.5; // Account for both input and output tokens

const calculateDelay = (tokensUsed: number) => {
  // Calculate how many minutes we need to wait based on token rate limit
  const minutesNeeded = (tokensUsed * SAFETY_FACTOR) / TOKEN_RATE_LIMIT;
  return Math.ceil(minutesNeeded * 60 * 1000); // Convert to milliseconds
};

const callWithRetry = async <T>(
  fn: () => Promise<T>,
  retries: number = 6,
  initialDelayMs: number = calculateDelay(MAX_TOKENS_PER_REQUEST)
): Promise<T> => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      console.error(`Attempt ${i + 1} failed:`, error);
      lastError = error;

      // Check if it's a rate limit error and extract wait time
      if (error?.message?.includes('Rate limit reached')) {
        const waitTimeMatch = error.message.match(/try again in (\d+)m(\d+(\.\d+)?)s/);
        if (waitTimeMatch) {
          const minutes = parseInt(waitTimeMatch[1]);
          const seconds = parseFloat(waitTimeMatch[2]);
          const waitTimeMs = (minutes * 60 + seconds) * 1000;
          // Add a small buffer to ensure we're past the rate limit
          await delay(waitTimeMs + 5000);
          continue;
        }
      }

      // If not a rate limit error or couldn't parse wait time, use exponential backoff
      if (i < retries - 1) {
        const backoffDelay = initialDelayMs * Math.pow(2, i);
        // Cap at 6 minutes
        const delayMs = Math.min(backoffDelay, 360000);
        await delay(delayMs);
      }
    }
  }
  throw lastError;
};

// Enhanced Error Handling
export enum ResearchErrorType {
  GENERATION_ERROR = 'GENERATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR'
}

// Advanced Error Class
export class ResearchError extends Error {
  constructor(
    public readonly type: ResearchErrorType,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ResearchError';
  }

  static fromError(error: unknown, type: ResearchErrorType = ResearchErrorType.GENERATION_ERROR): ResearchError {
    if (error instanceof ResearchError) return error;

    return new ResearchError(
      type, 
      error instanceof Error ? error.message : 'Unknown error occurred',
      error instanceof Error ? { stack: error.stack } : {}
    );
  }
}

// Validation Schemas
const ResearchConfigSchema = z.object({
  mode: z.enum(['basic', 'advanced', 'expert']),
  type: z.enum(['general', 'literature', 'experiment']),
  topic: z.string().min(3)
});

// Logging and Monitoring Service
export class ErrorMonitoringService {
  static log(error: ResearchError) {
    console.error(`[${error.type}] ${error.message}`, error.details);
    
    // Placeholder for external monitoring service integration
    // This could be replaced with Sentry, LogRocket, etc.
    try {
      // Example: Send error to monitoring service
      // MonitoringService.captureException(error);
    } catch (logError) {
      console.error('Error logging failed', logError);
    }
  }
}

// Configuration and Initialization
export class ResearchApiConfig {
  private static instance: ResearchApiConfig;
  
  public readonly supabase: SupabaseClient;
  public readonly groq: Groq;

  private constructor() {
    // Secure configuration loading
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

    if (!supabaseUrl || !supabaseKey || !groqApiKey) {
      throw new ResearchError(
        ResearchErrorType.AUTH_ERROR, 
        'Missing configuration: Check environment variables'
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    this.groq = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });
  }

  public static getInstance(): ResearchApiConfig {
    if (!ResearchApiConfig.instance) {
      ResearchApiConfig.instance = new ResearchApiConfig();
    }
    return ResearchApiConfig.instance;
  }
}

// Advanced API Call Wrapper
export async function safeApiCall<T>(
  fn: () => Promise<T>, 
  errorType: ResearchErrorType = ResearchErrorType.GENERATION_ERROR
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const researchError = ResearchError.fromError(error, errorType);
    ErrorMonitoringService.log(researchError);
    throw researchError;
  }
}

// Type-Safe API Services
import { ResearchSection, ResearchMode, ResearchType } from '../types/research';

interface ValidatedConfig {
  mode: ResearchMode;
  type: ResearchType;
  topic: string;
  researchTarget: string;
}

export class ResearchApiService {
  public readonly supabase: SupabaseClient;
  public readonly groq: Groq;

  private config = ResearchApiConfig.getInstance();

  constructor() {
    this.supabase = this.config.supabase;
    this.groq = this.config.groq;
  }

  // Unified Title Generation
  async generateTitle(
    prompt: string,
    mode: string,
    type: string
  ): Promise<string> {
    return callWithRetry(async () => {
      // Validate input
      const validatedConfig = ResearchConfigSchema.parse({ 
        topic: prompt, mode, type 
      });

      const completion = await this.groq.chat.completions.create({
        model: "llama-3.2-90b-vision-preview",
        messages: [
          {
            role: "system",
            content: "You are an academic expert who specializes in creating research titles."
          },
          {
            role: "user",
            content: `Generate one and only one sentence as an academic title using ${validatedConfig.mode} ${validatedConfig.type} research on: ${validatedConfig.topic} to describe what the research is about. Do not include an introduction, conclusion, or literature search. The title should be clear, concise, and focused on the topic ${validatedConfig.topic} to describe what the research is about`
          }
        ],
        temperature: 0.7,
        max_tokens: 150,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      if (!completion.choices[0]?.message?.content) {
        throw new Error('No response from OpenAI');
      }

      return completion.choices[0].message.content.trim();
    });
  }

  // Comprehensive Outline Generation
  async generateDetailedOutline(
    topic: string, 
    mode: string, 
    type: string,
    sectionCount: number
  ): Promise<string> {
    return callWithRetry(async () => {
      const { mode: validMode, type: validType, topic: validTopic } = ResearchConfigSchema.parse({
        mode: mode.toLowerCase(),
        type: type.toLowerCase(),
        topic
      });

      const prompt = `Generate a detailed research outline for a ${validType} research on "${validTopic}". 
        The outline should have exactly ${sectionCount} main sections, appropriate for a ${validMode} level research paper.
        Each section should be unique and have a descriptive title that clearly indicates its content.
        Follow these exact formatting rules:
        1. Main sections should be numbered like "1.", "2.", "3." followed by the title
        2. Subsections should be numbered like "1.1", "1.2", "1.3" followed by the title
        3. Each section and subsection should start on a new line
        4. Content should be on the line immediately after its section/subsection title
        5. Do not use the word "Section" in any headers
        6. Do not add any extra numbering or prefixes
        Example format:
        1. Introduction
        1.1 Background
        Brief background content here
        1.2 Objectives
        Research objectives content here`;

      const completion = await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.2-90b-vision-preview',
        temperature: 0.7,
        max_tokens: 8000,
      });

      return completion.choices[0]?.message?.content || '';
    });
  }

  // Outline Generation
  async generateOutline(
    researchTarget: string,
    mode: ResearchMode,
    type: ResearchType
  ): Promise<string> {
    return callWithRetry(async () => {
      const validatedConfig = await this.validateConfig({
        topic: researchTarget,
        mode,
        type,
        researchTarget
      });

      const sectionCount = mode === 'basic' ? 4 : mode === 'advanced' ? 16 : 30;
      let typeSpecificInstructions = '';
      
      switch(type) {
        case 'general':
          typeSpecificInstructions = `
Create a general research paper outline with standard academic sections.
Include an introduction, methodology, results, and conclusion.
Each main section should have 2-3 subsections.`;
          break;
        case 'literature':
          typeSpecificInstructions = `
Create a literature review paper outline focusing on analyzing existing research.
Include sections for different themes, methodological approaches, and gaps in research.
Each main section should analyze a different aspect of the literature.`;
          break;
        case 'experiment':
          typeSpecificInstructions = `
Create an experimental research paper outline with detailed methodology.
Include hypothesis, experimental design, data collection, and analysis sections.
Each main section should detail a specific aspect of the experiment.`;
          break;
      }

      const completion = await this.groq.chat.completions.create({
        model: "llama-3.2-90b-vision-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert academic research assistant. Create a detailed outline for a ${validatedConfig.mode} ${validatedConfig.type} research paper with exactly ${sectionCount} total sections (including subsections).

Format Requirements:
1. Use ONLY numbered sections (1., 2., 3., etc.) for main sections
2. Use decimal notation (1.1, 1.2, etc.) for subsections
3. Each section must have a clear title after the number
4. Each section must have a brief description on the next line
5. Main sections must be clearly distinguished from subsections
6. Ensure proper hierarchical structure

${typeSpecificInstructions}`
          },
          {
            role: "user",
            content: `Generate a research outline for: ${validatedConfig.researchTarget}`
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      if (!completion.choices[0]?.message?.content) {
        throw new Error('No response from AI');
      }

      return completion.choices[0].message.content;
    });
  }

  // Batch Section Generation
  async generateSectionBatch(
    sections: ResearchSection[],
    researchTarget: string,
    mode: ResearchMode,
    type: ResearchType
  ): Promise<ResearchSection[]> {
    return callWithRetry(async () => {
      const validatedConfig = await this.validateConfig({
        topic: researchTarget,
        mode,
        type,
        researchTarget,
        sections
      });

      const completion = await this.groq.chat.completions.create({
        model: "llama-3.2-90b-vision-preview",
        messages: [
          {
            role: "system",
            content: "You are an academic expert who specializes in research paper outlines and content generation."
          },
          {
            role: "user",
            content: `Generate detailed content with citations in markup format for a ${validatedConfig.mode} ${validatedConfig.type} research paper about: ${validatedConfig.researchTarget}
Do not include an introduction, conclusion, or literature search.
Section: ${sections[0].title}
Description: ${sections[0].content}

Keep the content focused and concise while maintaining academic quality.`
          }
        ],
        temperature: 0.7,
        max_tokens: MAX_TOKENS_PER_REQUEST,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      const content = completion.choices[0]?.message?.content || '';
      
      // Calculate tokens used for next delay
      const totalTokens = content.split(/\s+/).length * 1.5; // Rough estimate
      const nextDelay = calculateDelay(totalTokens);
      await delay(nextDelay);

      return sections.map(section => ({
        ...section,
        content: content
      }));
    });
  }

  // Target Generation
  async generateTarget(
    topic: string,
    mode: ResearchMode,
    type: ResearchType
  ): Promise<string> {
    return callWithRetry(async () => {
      const completion = await this.groq.chat.completions.create({
        model: "llama-3.2-90b-vision-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert academic research assistant. Your task is to refine and formalize research topics into clear, academically-structured research targets.
For a ${mode} ${type} paper, transform the given topic into a well-defined research target that:
1. Uses precise academic language
2. Has a clear scope and focus
3. Is appropriately complex for the specified mode and type
4. Can be researched academically`
          },
          {
            role: "user",
            content: `Transform this topic into a formal research target: ${topic}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      if (!completion.choices[0]?.message?.content) {
        throw new Error('No response from AI');
      }

      return completion.choices[0].message.content.trim();
    });
  }

  // Research Saving Mechanism
  async saveResearch(
    userId: string, 
    researchData: Record<string, unknown>
  ): Promise<string | undefined> {
    return safeApiCall(async () => {
      const { data, error } = await this.supabase
        .from('research')
        .insert({ 
          user_id: userId, 
          ...researchData 
        })
        .select('id')
        .single();

      if (error) throw error;
      return data?.id;
    }, ResearchErrorType.NETWORK_ERROR);
  }

  // Research History Retrieval
  async getResearchHistory(userId: string): Promise<any[]> {
    return safeApiCall(async () => {
      const { data, error } = await this.supabase
        .from('research')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }, ResearchErrorType.NETWORK_ERROR);
  }

  private async validateConfig(config: {
    topic: string;
    mode: ResearchMode;
    type: ResearchType;
    researchTarget: string;
    sections?: ResearchSection[];
  }): Promise<ValidatedConfig> {
    const validatedConfig = ResearchConfigSchema.parse({ 
      topic: config.topic,
      mode: config.mode,
      type: config.type
    });

    // Only validate sections if they are provided (for section generation)
    if (config.sections !== undefined && config.sections.length === 0) {
      throw new ResearchError(
        ResearchErrorType.VALIDATION_ERROR, 
        'No sections provided for generation'
      );
    }

    return {
      ...validatedConfig,
      researchTarget: config.researchTarget
    };
  }
}

// Export for use in application
export const researchApi = new ResearchApiService();
export const supabase = researchApi.supabase;
