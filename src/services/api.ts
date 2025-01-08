import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { z } from 'zod';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const TOKEN_RATE_LIMIT = 250000;
const MAX_TOKENS_PER_REQUEST = 8000;
const SAFETY_FACTOR = 1.5;

const calculateDelay = (tokensUsed: number) => {
  const minutesNeeded = (tokensUsed * SAFETY_FACTOR) / TOKEN_RATE_LIMIT;
  return Math.ceil(minutesNeeded * 60 * 1000);
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

      if (error?.message?.includes('Rate limit reached')) {
        const waitTimeMatch = error.message.match(/try again in (\d+)m(\d+(\.\d+)?)s/);
        if (waitTimeMatch) {
          const minutes = parseInt(waitTimeMatch[1]);
          const seconds = parseFloat(waitTimeMatch[2]);
          const waitTimeMs = (minutes * 60 + seconds) * 1000;
          await delay(waitTimeMs + 5000);
          continue;
        }
      }

      if (i < retries - 1) {
        const backoffDelay = initialDelayMs * Math.pow(2, i);
        const delayMs = Math.min(backoffDelay, 360000);
        await delay(delayMs);
      }
    }
  }
  throw lastError;
};

export enum ResearchErrorType {
  GENERATION_ERROR = 'GENERATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR'
}

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

const ResearchConfigSchema = z.object({
  mode: z.enum(['basic', 'advanced', 'expert']),
  type: z.enum(['general', 'literature', 'experiment']),
  topic: z.string().min(3)
});

export class ErrorMonitoringService {
  static log(error: ResearchError) {
    console.error(`[${error.type}] ${error.message}`, error.details);
  }
}

export class ResearchApiConfig {
  private static instance: ResearchApiConfig;
  
  public readonly supabase: SupabaseClient;
  public readonly groq: Groq;

  private constructor() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

    if (!supabaseUrl || !supabaseKey || !groqApiKey) {
      throw new ResearchError(
        ResearchErrorType.AUTH_ERROR, 
        'Missing configuration: Check environment variables'
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.groq = new Groq({ 
      apiKey: groqApiKey,
      dangerouslyAllowBrowser: true
    });
  }

  public static getInstance(): ResearchApiConfig {
    if (!ResearchApiConfig.instance) {
      ResearchApiConfig.instance = new ResearchApiConfig();
    }
    return ResearchApiConfig.instance;
  }
}

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

import { ResearchSection, ResearchMode, ResearchType } from '../types/research';

interface ValidatedConfig {
  mode: ResearchMode;
  type: ResearchType;
  topic: string;
  researchTarget: string;
}

export class ResearchApiService {
  private config = ResearchApiConfig.getInstance();
  public readonly supabase: SupabaseClient;
  public readonly groq: Groq;

  constructor() {
    this.supabase = this.config.supabase;
    this.groq = this.config.groq;
  }

  async generateTitle(
    prompt: string,
    mode: string,
    type: string,
    _userId?: string
  ): Promise<string> {
    return callWithRetry(async () => {
      const validatedConfig = await this.validateConfig({ 
        topic: prompt,
        mode,
        type,
        researchTarget: prompt
      });

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert academic research title generator specializing in post-graduate level academic writing. Generate a sophisticated, precise, and comprehensive research title.

TITLE REQUIREMENTS:
1. Length: 12-20 words with no additional comments
2. Structure: Main Title: Subtitle format
3. Language Level: Post-graduate academic vocabulary
4. Specificity: Must precisely indicate methodology and scope
5. Format: Use proper capitalization for academic titles

TITLE  MUST INCLUDE:
1. Primary Research Focus

STYLE GUIDELINES:
1. Use sophisticated academic terminology
4. Indicate research scope
5. Use precise technical vocabulary
6. Incorporate field-specific terminology

EXAMPLES BY TYPE:
- General Research:
  "Paradigmatic Shifts in Cognitive Neuroscience: A Longitudinal Analysis of Neural Plasticity in Adaptive Learning Mechanisms, 2015-2025"

- Literature Review:
  "Systematic Analysis of Quantum Computing Architectures: A Comprehensive Meta-Analysis of Scalability Parameters in Contemporary Quantum Systems"

- Experimental:
  "Quantitative Assessment of Neuroplastic Adaptations: A Multi-Modal Investigation of Synaptic Plasticity Using Advanced Imaging Techniques"

For topic: "${validatedConfig.topic}"
Type: ${validatedConfig.type}
Level: ${validatedConfig.mode}`
          }
        ],
        model: "llama-3.1-70b-versatile",
        temperature: 0.7,
        max_tokens: 50,
        top_p: 1,
        stop: null
      });

      const title = completion.choices[0]?.message?.content?.trim() || '';

      if (_userId) {
        const { error: updateError } = await this.supabase
          .from('research')
          .update({ title })
          .eq('user_id', _userId);

        if (updateError) {
          console.error('Error storing title:', updateError);
        }
      }

      return title;
    });
  }

  async generateDetailedOutline(
    topic: string, 
    mode: string, 
    type: string,
    _userId?: string
  ): Promise<string> {
    const validatedConfig = await this.validateConfig({ 
      topic, 
      mode, 
      type,
      researchTarget: topic
    });
    
    return await safeApiCall(async () => {
      const sectionCount = mode === 'basic' ? 4 : mode === 'advanced' ? 16 : 30;
      let typeSpecificInstructions = '';
      
      switch(type) {
        case 'general':
          typeSpecificInstructions = `
Example Sections Structure (each main section must have 3-4 detailed subsections):

1. Comprehensive Introduction and Research Context
[Detailed overview of the research landscape and significance]
1.1 Historical Evolution and Development of the Research Field
[Trace the progression and key developments]
1.2 Contemporary Challenges and Knowledge Gaps in Current Understanding
[Identify specific problems and missing knowledge]
1.3 Research Significance and Potential Impact on the Field
[Explain broader implications and contributions]
1.4 Theoretical Framework and Conceptual Foundations
[Establish the theoretical basis]

2. In-depth Analysis of Existing Literature and Current State of Knowledge
[Comprehensive review of current research landscape]
2.1 Critical Evaluation of Foundational Research Studies
[Analyze seminal works and their impact]
2.2 Emerging Trends and Recent Developments in the Field
[Examine latest research directions]
2.3 Contradictions and Debates in Current Literature
[Explore conflicting viewpoints]
2.4 Synthesis of Key Theoretical Frameworks
[Connect different theoretical approaches]

[Continue this pattern for remaining sections...]`;
          break;
        case 'literature':
          typeSpecificInstructions = `
Example Sections Structure (each main section must have 3-4 detailed subsections):

1. Comprehensive Overview of Literature Review Scope and Objectives
[Detailed framework of the review's purpose and methodology]
1.1 Historical Context and Evolution of Research Questions
[Trace development of key questions]
1.2 Current Debates and Theoretical Controversies
[Examine ongoing scholarly discussions]
1.3 Methodological Approaches in Existing Literature
[Analyze research methods used]
1.4 Gaps and Limitations in Current Understanding
[Identify knowledge gaps]

2. Critical Analysis of Theoretical Frameworks and Models
[In-depth examination of theoretical foundations]
2.1 Evolution of Theoretical Perspectives Over Time
[Track changes in theoretical understanding]
2.2 Competing Theoretical Models and Their Applications
[Compare different theoretical approaches]
2.3 Integration of Cross-disciplinary Theoretical Insights
[Explore interdisciplinary connections]
2.4 Emerging Theoretical Developments and Innovations
[Examine new theoretical directions]

[Continue this pattern for remaining sections...]`;
          break;
        case 'experiment':
          typeSpecificInstructions = `
Example Sections Structure (each main section must have 3-4 detailed subsections):

1. Comprehensive Experimental Framework and Research Context
[Detailed overview of experimental design and rationale]
1.1 Theoretical Foundations and Research Hypotheses Development
[Establish theoretical basis for experiments]
1.2 Innovation and Significance in Experimental Approach
[Explain unique aspects of methodology]
1.3 Integration with Existing Experimental Literature
[Connect to previous research]
1.4 Potential Impact and Applications of Experimental Findings
[Project broader implications]

2. Detailed Experimental Design and Methodological Framework
[Comprehensive explanation of experimental setup]
2.1 Advanced Variable Control and Measurement Techniques
[Detail precise control methods]
2.2 Novel Instrumentation and Technical Specifications
[Describe specialized equipment]
2.3 Innovative Data Collection Protocols and Procedures
[Explain unique data gathering]
2.4 Quality Assurance and Validation Mechanisms
[Detail accuracy measures]

[Continue this pattern for remaining sections...]`;
          break;
      }

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert academic research assistant creating a detailed, hierarchical outline. Your task is to create a comprehensive outline for a ${validatedConfig.mode} ${validatedConfig.type} research paper focused on the research target: "${validatedConfig.researchTarget}" with exactly ${sectionCount} total sections (including ALL subsections).

CRITICAL FORMATTING REQUIREMENTS:
1. EVERY main section MUST have 3-4 detailed subsections that explore different aspects
2. Main section titles must be unique, written in academic language, be long and descriptive (4-8 words), and incorporate aspects of the research target
3. Subsection titles must be detailed (5-10 words) and explore unique aspects
4. Each title must clearly indicate its specific content focus and not duplicate concepts from other sections
5. Use proper outline format: 1., 1.1, 1.2, 1.3, etc.
6. Each section AND subsection needs a detailed description (2-3 lines)
7. All descriptions must be unique and delve deep into the topic
8. Main sections should follow the structure below exactly
9. Never use generic words like "Section" or "Analysis" alone

TITLE FORMAT EXAMPLE:
1. Comprehensive Analysis of Neural Network Architecture Evolution
[Detailed examination of how neural network designs have progressed...]
1.1 Historical Development of Foundational Neural Network Models
[Traces the progression from early perceptrons through modern architectures...]
1.2 Critical Comparison of Contemporary Architecture Paradigms
[Analyzes differences between CNN, RNN, and transformer approaches...]
1.3 Impact of Hardware Advances on Architecture Innovation
[Examines how GPU/TPU developments influenced network design...]
1.4 Future Directions in Neural Architecture Development
[Projects emerging trends in architecture research...]

${typeSpecificInstructions}`
          }
        ],
        model: "llama-3.1-70b-versatile",
        temperature: 0.7,
        max_tokens: 8000,
        top_p: 1,
        stop: null
      });

      const outline = completion.choices[0]?.message?.content;
      if (!outline) {
        throw new ResearchError(
          ResearchErrorType.GENERATION_ERROR,
          'Failed to generate outline'
        );
      }

      return outline;
    });
  }

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
Example Sections Structure (each main section must have 3-4 detailed subsections):

1. Comprehensive Introduction and Research Context
[Detailed overview of the research landscape and significance]
1.1 Historical Evolution and Development of the Research Field
[Trace the progression and key developments]
1.2 Contemporary Challenges and Knowledge Gaps in Current Understanding
[Identify specific problems and missing knowledge]
1.3 Research Significance and Potential Impact on the Field
[Explain broader implications and contributions]
1.4 Theoretical Framework and Conceptual Foundations
[Establish the theoretical basis]

2. In-depth Analysis of Existing Literature and Current State of Knowledge
[Comprehensive review of current research landscape]
2.1 Critical Evaluation of Foundational Research Studies
[Analyze seminal works and their impact]
2.2 Emerging Trends and Recent Developments in the Field
[Examine latest research directions]
2.3 Contradictions and Debates in Current Literature
[Explore conflicting viewpoints]
2.4 Synthesis of Key Theoretical Frameworks
[Connect different theoretical approaches]

[Continue this pattern for remaining sections...]`;
          break;
        case 'literature':
          typeSpecificInstructions = `
Example Sections Structure (each main section must have 3-4 detailed subsections):

1. Comprehensive Overview of Literature Review Scope and Objectives
[Detailed framework of the review's purpose and methodology]
1.1 Historical Context and Evolution of Research Questions
[Trace development of key questions]
1.2 Current Debates and Theoretical Controversies
[Examine ongoing scholarly discussions]
1.3 Methodological Approaches in Existing Literature
[Analyze research methods used]
1.4 Gaps and Limitations in Current Understanding
[Identify knowledge gaps]

2. Critical Analysis of Theoretical Frameworks and Models
[In-depth examination of theoretical foundations]
2.1 Evolution of Theoretical Perspectives Over Time
[Track changes in theoretical understanding]
2.2 Competing Theoretical Models and Their Applications
[Compare different theoretical approaches]
2.3 Integration of Cross-disciplinary Theoretical Insights
[Explore interdisciplinary connections]
2.4 Emerging Theoretical Developments and Innovations
[Examine new theoretical directions]

[Continue this pattern for remaining sections...]`;
          break;
        case 'experiment':
          typeSpecificInstructions = `
Example Sections Structure (each main section must have 3-4 detailed subsections):

1. Comprehensive Experimental Framework and Research Context
[Detailed overview of experimental design and rationale]
1.1 Theoretical Foundations and Research Hypotheses Development
[Establish theoretical basis for experiments]
1.2 Innovation and Significance in Experimental Approach
[Explain unique aspects of methodology]
1.3 Integration with Existing Experimental Literature
[Connect to previous research]
1.4 Potential Impact and Applications of Experimental Findings
[Project broader implications]

2. Detailed Experimental Design and Methodological Framework
[Comprehensive explanation of experimental setup]
2.1 Advanced Variable Control and Measurement Techniques
[Detail precise control methods]
2.2 Novel Instrumentation and Technical Specifications
[Describe specialized equipment]
2.3 Innovative Data Collection Protocols and Procedures
[Explain unique data gathering]
2.4 Quality Assurance and Validation Mechanisms
[Detail accuracy measures]

[Continue this pattern for remaining sections...]`;
          break;
      }

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert academic research assistant creating a detailed, hierarchical outline. Your task is to create a comprehensive outline for a ${validatedConfig.mode} ${validatedConfig.type} research paper focused on the research target: "${researchTarget}" with exactly ${sectionCount} total sections (including ALL subsections).

CRITICAL FORMATTING REQUIREMENTS:
1. EVERY main section MUST have 3-4 detailed subsections that explore different aspects
2. Main section titles must be unique, written in academic language, be long and descriptive (4-8 words), and incorporate aspects of the research target
3. Subsection titles must be detailed (5-10 words) and explore unique aspects
4. Each title must clearly indicate its specific content focus and not duplicate concepts from other sections
5. Use proper outline format: 1., 1.1, 1.2, 1.3, etc.
6. Each section AND subsection needs a detailed description (2-3 lines)
7. All descriptions must be unique and delve deep into the topic
8. Main sections should follow the structure below exactly
9. Never use generic words like "Section" or "Analysis" alone

TITLE FORMAT EXAMPLE:
1. Comprehensive Analysis of Neural Network Architecture Evolution
[Detailed examination of how neural network designs have progressed...]
1.1 Historical Development of Foundational Neural Network Models
[Traces the progression from early perceptrons through modern architectures...]
1.2 Critical Comparison of Contemporary Architecture Paradigms
[Analyzes differences between CNN, RNN, and transformer approaches...]
1.3 Impact of Hardware Advances on Architecture Innovation
[Examines how GPU/TPU developments influenced network design...]
1.4 Future Directions in Neural Architecture Development
[Projects emerging trends in architecture research...]

${typeSpecificInstructions}`
          }
        ],
        model: "llama-3.1-70b-versatile",
        temperature: 0.7,
        max_tokens: 8000,
        top_p: 1,
        stop: null
      });

      if (!completion.choices[0]?.message?.content) {
        throw new Error('No response from AI');
      }

      return completion.choices[0].message.content;
    });
  }

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

      let retryCount = 0;
      const INITIAL_DELAY_MS = 15000;
      const MAX_RETRY_COUNT = 8;

      async function adaptiveDelay(retryCount: number = 0) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, Math.min(retryCount, MAX_RETRY_COUNT));
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      await adaptiveDelay(retryCount);

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a distinguished academic scholar with extensive expertise in research methodology and academic writing. Your task is to generate sophisticated, post-graduate level content that demonstrates deep analytical thinking and scholarly rigor.

Instructions for Academic Writing Style:
1. Employ advanced academic vocabulary and complex sentence structures appropriate for post-graduate level discourse
2. Maintain a formal, scholarly tone throughout the content
3. Develop arguments with nuanced analysis and critical evaluation
4. Integrate theoretical frameworks with empirical evidence
5. Demonstrate comprehensive understanding of interdisciplinary perspectives

Citation and Reference Guidelines:
1. Integrate in-text citations seamlessly using APA format: (Author, Year) or (Author et al., Year)
2. Ensure each citation corresponds to a complete reference entry
3. Format references in APA style with meticulous attention to detail
4. Place references in a dedicated "References" section at the conclusion

Content Structure Requirements:
1. Begin each section with sophisticated, descriptive content that establishes context
2. Do not include the sectin number or the section title in the content
3. Develop arguments progressively, building complexity through logical progression
4. Integrate multiple theoretical perspectives and empirical evidence
5. Maintain coherent thematic connections throughout the content
6. Conclude sections with synthesis of key arguments and implications
7. Do not include any section numbers or titles in the content
8. Focus on developing the content itself, not its structural organization

Write in a verbose, academically rigorous style that demonstrates expert-level understanding of the subject matter.`
          },
          {
            role: "user",
            content: `Generate comprehensive, post-graduate level content with rigorous academic citations for a ${validatedConfig.mode} ${validatedConfig.type} research paper examining: ${validatedConfig.researchTarget}

Focus area: ${sections[0].content}

Requirements:
1. Maintain sophisticated academic discourse appropriate for post-graduate level
2. Integrate relevant theoretical frameworks and empirical evidence
3. Include extensive scholarly citations
4. Develop nuanced arguments and critical analysis
5. Conclude with a complete References section in APA format
6. Do not include any section numbers or titles in the content

Emphasize depth of analysis while maintaining scholarly rigor.`
          }
        ],
        model: "mixtral-8x7b-32768",
        temperature: 0.3,
        max_tokens: 8000,
        top_p: 1,
        stream: false
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

  private async validateConfig(config: {
    topic: string;
    mode: string;
    type: string;
    researchTarget: string;
    sections?: ResearchSection[];
  }): Promise<ValidatedConfig> {
    const { mode, type, topic } = config;
    
    try {
      const validatedData = ResearchConfigSchema.parse({
        mode: mode.toLowerCase(),
        type: type.toLowerCase(),
        topic
      });
      
      return {
        mode: validatedData.mode,
        type: validatedData.type,
        topic: validatedData.topic,
        researchTarget: topic
      };
    } catch (error) {
      throw new ResearchError(
        ResearchErrorType.VALIDATION_ERROR,
        'Invalid configuration',
        { error }
      );
    }
  }
}

export const researchApi = new ResearchApiService();
export const supabase = researchApi.supabase;