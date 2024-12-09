import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import { ResearchMode, ResearchType } from '../store/slices/researchSlice';
import { ResearchError, ResearchException, TOKEN_LIMITS } from './researchErrors';
import { validateOutlineStructure } from './outlineValidation';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const GROQ_API_URL = import.meta.env.VITE_GROQ_API_URL
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const SEARCH_API_URL = import.meta.env.VITE_SEARCH_API_URL

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Initialize Axios instances
const groqApi = axios.create({
  baseURL: GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
  headers: {
    'Authorization': `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Ensure trailing slash is handled correctly
groqApi.interceptors.request.use((config) => {
  // Remove any trailing slashes from baseURL
  config.baseURL = config.baseURL?.replace(/\/+$/, '');
  return config;
});

const searchApi = axios.create({
  baseURL: SEARCH_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// API Configuration and Helpers
const GROQ_CONFIG = {
  MODEL: 'mixtral-8x7b-32768',
  MAX_TOKENS_TOTAL: 32768,
  MIN_DELAY: 20000,      // Minimum delay between API calls (20 seconds)
  RETRY_DELAY: 30000,    // Delay when retrying after an error (30 seconds)
  MAX_RETRIES: 3,        // Maximum number of retries for API calls
  API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 2000
};

let lastApiCallTime = 0;

// Centralized delay management
export const waitBetweenCalls = async (retryCount: number = 0): Promise<void> => {
  const currentTime = Date.now();
  const timeSinceLastCall = currentTime - lastApiCallTime;
  const delay = retryCount > 0 
    ? Math.max(GROQ_CONFIG.RETRY_DELAY * retryCount, GROQ_CONFIG.MIN_DELAY)
    : GROQ_CONFIG.MIN_DELAY;
  
  const remainingDelay = Math.max(0, delay - timeSinceLastCall);
  
  if (remainingDelay > 0) {
    console.log(`Waiting ${remainingDelay/1000} seconds before next API call${retryCount > 0 ? ` (retry ${retryCount})` : ''}...`);
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }
  
  lastApiCallTime = Date.now();
};

// Helper function for API calls with retry logic
const makeApiCall = async <T>(
  callFn: () => Promise<T>,
  errorMsg: string,
  retryCount: number = 0
): Promise<T> => {
  try {
    // Check if API key is configured
    if (!GROQ_API_KEY) {
      throw new ResearchException(ResearchError.API_ERROR, 'GROQ API key is not configured');
    }

    await waitBetweenCalls(retryCount);
    const result = await callFn();
    lastApiCallTime = Date.now(); // Update last API call time
    return result;
  } catch (error: any) {
    console.error(`${errorMsg}:`, error);
    
    // Handle rate limiting
    if (error.response?.status === 429 || (error.message && error.message.includes('rate limit'))) {
      if (retryCount < GROQ_CONFIG.MAX_RETRIES) {
        console.log(`Rate limit hit, retrying (${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES})...`);
        return makeApiCall(callFn, errorMsg, retryCount + 1);
      }
      throw new ResearchException(ResearchError.API_ERROR, 'Rate limit exceeded after multiple retries');
    }
    
    // Handle authentication errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new ResearchException(ResearchError.API_ERROR, 'Invalid API key or authentication failed');
    }

    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new ResearchException(ResearchError.API_ERROR, 'Network error: Unable to connect to the research service');
    }

    // Handle timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      throw new ResearchException(
        ResearchError.TIMEOUT_ERROR,
        'Request timed out'
      );
    }

    // Handle other errors
    throw new ResearchException(
      ResearchError.API_ERROR,
      errorMsg + (error.message ? `: ${error.message}` : '')
    );
  }
};

// Helper function to estimate tokens (rough estimate: 1 token ≈ 4 characters)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4)
}

// GROQ API calls
export const generateTitle = async (query: string): Promise<string> => {
  try {
    const response = await makeApiCall(
      async () => {
        const response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: GROQ_CONFIG.MODEL,
            messages: [
              {
                role: 'system',
                content: `You are an expert academic title generator. Follow these rules:
1. Create a single, technically precise sentence
2. Use field-specific terminology and academic language
3. Incorporate key concepts and variables from the topic
4. Ensure title reflects research methodology or approach
5. Include measurable outcomes or objectives
6. Consider theoretical frameworks or models
7. Use appropriate connecting words (e.g., utilizing, through, via)
8. Maintain clarity despite technical complexity
9. Focus on the primary research question or hypothesis
10. Structure as: [Main Concept]: [Methodology/Approach] for [Outcome/Objective]`
              },
              {
                role: 'user',
                content: `Generate an academic title for this topic: ${query}`
              }
            ],
            temperature: 0.7,
            max_tokens: 100
          })
        });
        return response.json();
      },
      'Failed to generate title'
    );

    const result = await response;
    return result.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating title:', error);
    throw error;
  }
}

export const generateSection = async (
  topic: string,
  sectionTitle: string,
  citationStyle: string = 'APA',
  isSubsection: boolean = false
): Promise<{ content: string; warning?: string }> => {
  try {
    const minWords = isSubsection ? 1000 : 2000;

    const response = await makeApiCall(
      async () => {
        const response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: GROQ_CONFIG.MODEL,
            messages: [
              {
                role: 'system',
                content: `You are an expert academic researcher writing a detailed research paper. Follow these rules:
1. Write a detailed ${isSubsection ? 'subsection' : 'section'} with minimum ${minWords} words
2. Include at least 5-7 academic citations using ${citationStyle} style
3. Be thorough and academically rigorous
4. Include specific examples, data, and evidence
5. Maintain formal academic tone
6. Cite recent research papers (2015-2024 preferred)
7. ${isSubsection ? 'Focus on specific aspects of the main section' : 'Provide a comprehensive overview'}
8. Structure content with clear paragraphs and logical flow
9. Include relevant statistics and research findings
10. Connect ideas and maintain coherent narrative throughout`
              },
              {
                role: 'user',
                content: `Write a detailed ${isSubsection ? 'subsection' : 'section'} about "${sectionTitle}" for a research paper on: ${topic}`
              }
            ],
            temperature: 0.7,
            max_tokens: 4000
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error('Invalid API response format');
        }

        return data;
      },
      'Failed to generate section'
    );

    const result = await response;
    if (!result.choices?.[0]?.message?.content) {
      throw new Error('Empty response from API');
    }

    const content = result.choices[0].message.content.trim();
        
    // Check content length but don't throw error
    const wordCount = content.split(/\s+/).length;
    if (wordCount < minWords) {
      return {
        content,
        warning: `Generated content shorter than requested: ${wordCount} words vs target ${minWords}`
      };
    }

    return { content };
  } catch (error) {
    console.error('Error generating section:', error);
    throw error;
  }
};

export const generateSectionBatch = async (
  title: string,
  sections: { sectionTitle: string; prompt: string }[],
  citationStyle: string
): Promise<string[]> => {
  try {
    const systemPrompt = `You are an expert academic researcher generating multiple sections for a research paper.
Use ${citationStyle} citation style and maintain high academic standards.

Requirements for each section:
1. Maintain proper section numbering throughout
2. Each subsection must have 4-5 detailed paragraphs
3. Minimum 800 words per subsection
4. Multiple citations per paragraph
5. Include comprehensive analysis
6. Balance theoretical and practical content
7. Integrate research findings
8. Use technical terminology
9. Address methodological considerations
10. Connect to broader research context`

    const batchPrompt = sections.map((section, index) => 
      `Section ${index + 1}: ${section.sectionTitle}\n${section.prompt}`
    ).join('\n\n')

    const promptTokens = estimateTokens(systemPrompt) + estimateTokens(batchPrompt) + estimateTokens(title)
    const maxCompletionTokens = GROQ_CONFIG.MAX_TOKENS_TOTAL - promptTokens

    const response = await makeApiCall(
      async () => {
        const response = await groqApi.post('', {
          model: GROQ_CONFIG.MODEL,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: `Research Title: "${title}"\n\nGenerate content for multiple sections:\n${batchPrompt}`
            }
          ],
          temperature: 0.7,
          max_tokens: maxCompletionTokens
        });
        return response.data;
      },
      'Failed to generate section batch'
    );

    // Split the response into sections and ensure proper numbering
    const content = response.choices[0].message.content
    return content.split(/(?=\d+\.\s)/).map(section => section.trim())
  } catch (error) {
    console.error('Error in generateSectionBatch:', error);
    throw error;
  }
}

export const generateOutline = async (topic: string): Promise<string> => {
  try {
    let retryCount = 0;

    const prompt = `Generate a detailed research outline for the topic: "${topic}"
    Requirements:
    - Include all major sections (Introduction, Methodology, Results, Discussion, etc.)
    - Each section should have a clear, descriptive title
    - Sections should be numbered (1. Introduction, 2. Background, etc.)
    - Include 8-12 main sections
    - Exclude subsections from this outline
    Format the outline as a simple numbered list (1. Section Title\\n2. Section Title\\n etc.)`;

    while (retryCount < GROQ_CONFIG.MAX_RETRIES) {
      try {
        console.log(`Attempting to generate outline (attempt ${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES})`);
        
        if (retryCount > 0) {
          await waitBetweenCalls(retryCount);
        }

        const response = await makeApiCall(
          async () => {
            const messages = [
              { role: 'system', content: 'You are a research outline generator. Generate detailed outlines with specific section counts and formatting.' },
              { role: 'user', content: prompt }
            ];

            // Calculate total tokens and check limits
            const totalTokens = messages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
            if (totalTokens > TOKEN_LIMITS.MAX_PROMPT_TOKENS) {
              throw new ResearchException(
                ResearchError.TOKEN_LIMIT_EXCEEDED,
                'The combined prompt is too long. Please provide a shorter topic or reduce requirements.'
              );
            }

            const response = await fetch(GROQ_API_URL, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: GROQ_CONFIG.MODEL,
                messages,
                temperature: 0.7,
                max_tokens: 1000,
              }),
            });
            return response.json();
          },
          'Failed to generate outline'
        );

        const data = await response;
        const outline = data.choices[0].message.content.trim();
        
        if (!outline) {
          throw new Error('Empty outline received from API');
        }

        // Wait before returning to ensure delay between subsequent calls
        await waitBetweenCalls();
        console.log('Successfully generated outline');
        return outline;

      } catch (error) {
        console.error(`Error on attempt ${retryCount + 1}/${GROQ_CONFIG.MAX_RETRIES}:`, error);
        
        if (retryCount === GROQ_CONFIG.MAX_RETRIES - 1) {
          throw new Error(`Failed to generate outline after ${GROQ_CONFIG.MAX_RETRIES} attempts: ${error.message}`);
        }
        
        retryCount++;
        await waitBetweenCalls(retryCount);
      }
    }

    throw new Error('Failed to generate outline after maximum retries');
  } catch (error) {
    console.error('Error in generateOutline:', error);
    throw error;
  }
};

export const generateDetailedOutline = async (topic: string, mode: ResearchMode, type: ResearchType): Promise<string> => {
  if (!topic || !mode || type === undefined) {
    throw new ResearchException(
      ResearchError.VALIDATION_FAILED,
      'Missing required parameters: topic, mode, and type are required'
    );
  }

  // Estimate tokens in the topic
  const topicTokens = estimateTokens(topic);
  if (topicTokens > TOKEN_LIMITS.MAX_PROMPT_TOKENS) {
    throw new ResearchException(
      ResearchError.TOKEN_LIMIT_EXCEEDED,
      'Research topic is too long. Please provide a shorter topic.'
    );
  }

  let minSections: number;
  let maxSections: number;
  let includeSubsections: boolean;
  let requireAbstractConclusion: boolean;
  
  // Section counts based on mode and type
  switch (mode) {
    case ResearchMode.Advanced:
      if (type === ResearchType.Article) {
        minSections = 3;
        maxSections = 5;
        includeSubsections = false;
      } else {
        // Advanced mode section counts
        minSections = 25;
        maxSections = 52;
        includeSubsections = true;
      }
      requireAbstractConclusion = type !== ResearchType.Article;
      break;
    
    case ResearchMode.Basic:
    default:
      if (type === ResearchType.Article) {
        minSections = 3;
        maxSections = 5;
        includeSubsections = false;
      } else {
        minSections = 8;
        maxSections = 12;
        includeSubsections = false;
      }
      requireAbstractConclusion = type !== ResearchType.Article;
      break;
  }

  const getTypeString = (researchType: ResearchType): string => {
    switch (researchType) {
      case ResearchType.Article:
        return 'article';
      case ResearchType.General:
        return 'general';
      case ResearchType.Literature:
        return 'literature review';
      case ResearchType.Experiment:
        return 'experimental';
      default:
        return 'research';
    }
  };

  const typeString = getTypeString(type);
  const systemPrompt = `You are a research outline generator. Create a detailed outline for a ${typeString} on the topic: "${topic}".
Requirements:
- Generate between ${minSections} to ${maxSections} total sections (including main sections and subsections)
${includeSubsections ? '- Each main section MUST have 2-3 subsections (this is required)\n- Aim for 8-15 main sections with their subsections adding up to ${minSections}-${maxSections} total\n' : ''}
${requireAbstractConclusion ? '- Must include Abstract and Conclusion sections\n' : ''}
- Each section and subsection must have 2-3 key points or requirements
- Use clear, academic language
- Ensure logical flow and progression of ideas
- Format using numbers for main sections (1., 2., 3.) and decimal numbers for subsections (1.1., 1.2., 1.3.)
- Include "Requirements:" after each section and subsection title followed by bullet points
- IMPORTANT: The outline MUST contain at least ${minSections} total sections (main sections + subsections)
- Keep the total response under ${TOKEN_LIMITS.MAX_COMPLETION_TOKENS} tokens

Example format for Basic/Article mode (3-5 sections):
1. Introduction
Requirements:
- Provide background on the topic
- State research objectives
- Outline methodology

2. Literature Review
Requirements:
- Review current research
- Identify key findings
- Highlight research gaps

3. Methodology
Requirements:
- Research approach
- Data collection methods
- Analysis techniques

4. Results and Discussion
Requirements:
- Present key findings
- Analyze implications
- Compare with existing research

5. Conclusion
Requirements:
- Summarize findings
- State limitations
- Suggest future research

Example format for Advanced mode (with subsections):
1. Abstract
Requirements:
- Provide overview of the research
- State main findings
- Highlight key conclusions

2. Introduction
Requirements:
- Provide background on the topic
- State research objectives
- Outline methodology

2.1. Background Context
Requirements:
- Historical development of the field
- Current state of research
- Key challenges and gaps

2.2. Research Objectives
Requirements:
- Primary research goals
- Specific objectives
- Expected outcomes

3. [Next Section Title]
Requirements:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

3.1. [Subsection Title]
Requirements:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]`;

  const prompt = `Generate a detailed research outline for: ${topic}. The outline must have at least ${minSections} total sections.`;
  
  try {
    let retryCount = 0;
    const maxRetries = 3;
    const maxAttemptTime = 30000; // 30 seconds timeout

    while (retryCount < maxRetries) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new ResearchException(
              ResearchError.TIMEOUT_ERROR,
              'Outline generation timed out after 30 seconds'
            ));
          }, maxAttemptTime);
        });

        const outlinePromise = makeApiCall(
          async () => {
            const messages = [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ];

            // Calculate total tokens and check limits
            const totalTokens = messages.reduce((acc, msg) => acc + estimateTokens(msg.content), 0);
            if (totalTokens > TOKEN_LIMITS.MAX_PROMPT_TOKENS) {
              throw new ResearchException(
                ResearchError.TOKEN_LIMIT_EXCEEDED,
                'The combined prompt is too long. Please provide a shorter topic or reduce requirements.'
              );
            }

            const response = await fetch(GROQ_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
              },
              body: JSON.stringify({
                model: GROQ_CONFIG.MODEL,
                messages,
                temperature: 0.7,
                max_tokens: TOKEN_LIMITS.MAX_COMPLETION_TOKENS,
                top_p: 1,
                stream: false
              })
            });

            if (!response.ok) {
              throw new ResearchException(
                ResearchError.API_ERROR,
                `API request failed with status ${response.status}`
              );
            }

            return response.json();
          },
          'Failed to generate outline'
        );

        const response = await Promise.race([outlinePromise, timeoutPromise]);
        const outline = response.choices[0].message.content.trim();

        // Validate the generated outline
        const validation = validateOutlineStructure(outline, mode, type);
        if (!validation.isValid) {
          throw new ResearchException(
            ResearchError.VALIDATION_FAILED,
            `Invalid outline structure: ${validation.reason}`
          );
        }

        return outline;

      } catch (error) {
        console.error(`Attempt ${retryCount + 1} failed:`, error);
        
        if (error instanceof ResearchException) {
          if (error.type === ResearchError.TIMEOUT_ERROR ||
              error.type === ResearchError.TOKEN_LIMIT_EXCEEDED ||
              error.type === ResearchError.VALIDATION_FAILED) {
            throw error; // Don't retry these errors
          }
        }

        if (retryCount === maxRetries - 1) {
          throw new ResearchException(
            ResearchError.API_ERROR,
            `Failed to generate outline after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }

        retryCount++;
        await waitBetweenCalls(retryCount);
      }
    }

    throw new ResearchException(
      ResearchError.API_ERROR,
      'Failed to generate outline after maximum retries'
    );
  } catch (error) {
    if (error instanceof ResearchException) {
      throw error;
    }
    throw new ResearchException(
      ResearchError.API_ERROR,
      `Unexpected error in outline generation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

export const parseSectionsFromOutline = (outline: string): string[] => {
  const sections: string[] = [];
  const lines = outline.split('\n').map((line: string) => line.trim());
  
  for (const line of lines) {
    if (/^\d+\./.test(line)) {
      sections.push(line);
    }
  }
  
  return sections;
};

export const generateReferences = async (topic: string, citationStyle: string = 'APA'): Promise<string[]> => {
  const maxRetries = 5;
  const baseDelay = 15000;
  let retryCount = 0;

  const prompt = `Generate a list of academic references for research on "${topic}".
  Requirements:
  - Use ${citationStyle} citation style
  - Include at least 10-15 references
  - Focus on recent publications (2015-2024)
  - Include journal articles, books, and conference papers
  - Format each reference on a new line
  - Ensure citations are complete with all required elements`;

  while (retryCount < maxRetries) {
    try {
      if (retryCount > 0) {
        console.log(`Attempt ${retryCount + 1}/${maxRetries} for references generation`);
        await new Promise(resolve => setTimeout(resolve, baseDelay * retryCount));
      }

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_CONFIG.MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert academic researcher creating a reference list. Format each reference according to the specified citation style.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from API');
      }

      const content = data.choices[0].message.content;
      const references = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (references.length === 0) {
        throw new Error('No references generated');
      }

      return references;
    } catch (error) {
      console.error(`Error on attempt ${retryCount + 1}/${maxRetries}:`, error);
      retryCount++;
      
      if (retryCount === maxRetries) {
        console.error('Failed to generate references after all retries');
        return ['Error: Failed to generate references. Please try again.'];
      }
      
      await new Promise(resolve => setTimeout(resolve, baseDelay * retryCount));
    }
  }

  return ['Error: Failed to generate references after all retries'];
};

// Semantic Scholar API calls
export const searchPapers = async (query: string, limit = 10): Promise<any> => {
  try {
    const response = await fetch(`${SEARCH_API_URL}/search?query=${encodeURIComponent(query)}&limit=${limit}`);
    const data = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error searching papers';
    console.error('Error searching papers:', errorMessage);
    throw new Error(errorMessage);
  }
};

export const getPaperDetails = async (paperId: string) => {
  const response = await searchApi.get(`/paper/${paperId}`, {
    params: {
      fields: 'title,abstract,authors,year,url,references,citations'
    }
  })
  return response.data
}

// Supabase database operations
export const saveResearch = async (researchData: any) => {
  const { data, error } = await supabase
    .from('research_queries')
    .insert([researchData])

  if (error) throw error
  return data
}

export const getResearchHistory = async (userId: string) => {
  const { data, error } = await supabase
    .from('research_queries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}
