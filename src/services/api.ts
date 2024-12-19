import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { z } from 'zod'; // Added for enhanced type validation

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
  mode: z.enum(['basic', 'advanced', 'article']),
  type: z.enum(['general', 'literature', 'experiment', 'article']),
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
    topic: string, 
    mode: string, 
    type: string
  ): Promise<string> {
    return safeApiCall(async () => {
      // Validate input
      const validatedConfig = ResearchConfigSchema.parse({ 
        topic, mode, type 
      });

      const response = await this.groq.chat.completions.create({
        messages: [{
          role: "user",
          content: `Generate an academic title for a ${validatedConfig.mode} ${validatedConfig.type} research on: ${validatedConfig.topic}`
        }],
        model: "llama-3.2-90b-vision-preview",
        max_tokens: 8000,
        temperature: 0.7
      });

      const title = response.choices[0]?.message?.content?.trim();
      
      if (!title) {
        throw new ResearchError(
          ResearchErrorType.GENERATION_ERROR, 
          'Failed to generate title'
        );
      }

      return title;
    });
  }

  // Comprehensive Outline Generation
  async generateDetailedOutline(
    topic: string, 
    mode: string, 
    type: string
  ): Promise<string> {
    return safeApiCall(async () => {
      const validatedConfig = ResearchConfigSchema.parse({ 
        topic, mode, type 
      });

      const response = await this.groq.chat.completions.create({
        messages: [{
          role: "user",
          content: `Generate a structured research outline for a ${validatedConfig.mode} ${validatedConfig.type} on: ${validatedConfig.topic}`
        }],
        model: "llama-3.2-90b-vision-preview",
        max_tokens: 8000,
        temperature: 0.6
      });

      const outline = response.choices[0]?.message?.content?.trim();
      
      if (!outline) {
        throw new ResearchError(
          ResearchErrorType.GENERATION_ERROR, 
          'Failed to generate outline'
        );
      }

      return outline;
    });
  }

  // Batch Section Generation
  async generateSectionBatch(
    sections: Array<{ sectionTitle: string; sectionDescription: string }>,
    topic: string,
    mode: string,
    type: string
  ): Promise<string[]> {
    return safeApiCall(async () => {
      const validatedConfig = ResearchConfigSchema.parse({ 
        topic, mode, type 
      });

      // Validate sections
      if (!sections || sections.length === 0) {
        throw new ResearchError(
          ResearchErrorType.VALIDATION_ERROR, 
          'No sections provided for generation'
        );
      }

      // Concurrent section generation
      const sectionContents = await Promise.all(
        sections.map(async (section) => {
          const response = await this.groq.chat.completions.create({
            messages: [{
              role: "user",
              content: `Generate content for section: ${section.sectionTitle}
In context of ${validatedConfig.topic}
Research Mode: ${validatedConfig.mode}
Research Type: ${validatedConfig.type}`
            }],
            model: "llama-3.2-90b-vision-preview",
            max_tokens: 8000,
            temperature: 0.7
          });

          return response.choices[0]?.message?.content?.trim() || '';
        })
      );

      return sectionContents;
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
}

// Export for use in application
export const researchApi = new ResearchApiService();
export const supabase = researchApi.supabase;
