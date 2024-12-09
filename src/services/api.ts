import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import { ResearchMode, ResearchType } from '../store/slices/researchSlice';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const GROQ_API_URL = import.meta.env.VITE_GROQ_API_URL
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const SEARCH_API_URL = import.meta.env.VITE_SEARCH_API_URL

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Initialize Axios instances
const groqApi = axios.create({
  baseURL: GROQ_API_URL,
  headers: {
    'Authorization': `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  },
})

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

// Centralized delay management
export const waitBetweenCalls = async (retryCount: number = 0): Promise<void> => {
  const delay = retryCount > 0 
    ? Math.max(GROQ_CONFIG.RETRY_DELAY * retryCount, GROQ_CONFIG.MIN_DELAY)
    : GROQ_CONFIG.MIN_DELAY;
  
  console.log(`Waiting ${delay/1000} seconds before next API call${retryCount > 0 ? ` (retry ${retryCount})` : ''}...`);
  await new Promise(resolve => setTimeout(resolve, delay));
};

// Helper function for API calls with retry logic
const makeApiCall = async <T>(
  callFn: () => Promise<T>,
  errorMsg: string,
  retryCount: number = 0
): Promise<T> => {
  try {
    console.log(`Making API call (attempt ${retryCount + 1})...`);
    const result = await callFn();
    return result;
  } catch (error) {
    console.error(`${errorMsg}:`, error);
    
    if (retryCount >= GROQ_CONFIG.MAX_RETRIES - 1) {
      throw new Error(`${errorMsg} after ${GROQ_CONFIG.MAX_RETRIES} attempts`);
    }
    
    console.log(`Retrying in ${GROQ_CONFIG.RETRY_DELAY/1000} seconds...`);
    await waitBetweenCalls(retryCount + 1);
    return makeApiCall(callFn, errorMsg, retryCount + 1);
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
            const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
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
                    content: 'You are a research outline generator. Generate detailed outlines with specific section counts and formatting.'
                  },
                  {
                    role: 'user',
                    content: prompt
                  }
                ],
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
    throw new Error('Missing required parameters: topic, mode, and type are required');
  }

  let minSections: number;
  let maxSections: number;
  let includeSubsections: boolean;
  let requireAbstractConclusion: boolean;
  
  // Determine section counts based on both mode and type
  if (type === ResearchType.Article) {
    // Article type always has 3-5 sections regardless of mode
    minSections = 3;
    maxSections = 5;
    includeSubsections = false;
    requireAbstractConclusion = false;
  } else {
    // For all other types (General, Literature, Experiment)
    switch (mode) {
      case ResearchMode.Basic:
        minSections = 11;
        maxSections = 15;
        includeSubsections = false;
        requireAbstractConclusion = true;
        break;
      case ResearchMode.Advanced:
        minSections = 42;
        maxSections = 50;
        includeSubsections = true;
        requireAbstractConclusion = true;
        break;
      default:
        minSections = 11;
        maxSections = 15;
        includeSubsections = false;
        requireAbstractConclusion = true;
    }
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

  const sectionInstructions = type === ResearchType.Article
    ? `CRITICAL: Generate EXACTLY between ${minSections} and ${maxSections} main sections (no more, no less).
       Do NOT include Abstract or Conclusion sections.
       Each section must be a core content section.
       Number sections sequentially from 1 to ${maxSections}.
       DO NOT use subsections.`
    : `Generate between ${minSections} and ${maxSections} ${includeSubsections ? 'total sections and subsections' : 'main sections'}.
       ${requireAbstractConclusion ? 'Start with an Abstract section and end with a Conclusion section.' : ''}
       ${includeSubsections ? 'Use subsections (e.g., 1.1, 1.2) to organize related content.' : ''}`;

  const prompt = `Create a detailed outline for a ${typeString} research paper about "${topic}".

    ${sectionInstructions}

    Format each section as:
    [Number]. [Title]
    Requirements:
    - [Requirement 1]
    - [Requirement 2]
    - [Requirement 3]

    CRITICAL RULES:
    1. Section count must be:
       ${type === ResearchType.Article 
         ? `EXACTLY between ${minSections}-${maxSections} main sections, no subsections` 
         : includeSubsections 
           ? `${minSections}-${maxSections} total sections and subsections combined` 
           : `${minSections}-${maxSections} main sections`}
    2. Each section must have a clear, descriptive title
    3. Each section must include 2-3 specific requirements
    4. Ensure logical flow between sections`;

  try {
    const makeRequest = async () => {
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
              content: `You are a research outline generator that strictly enforces section count limits.
                ${type === ResearchType.Article 
                  ? `For Article type: You MUST generate EXACTLY ${minSections}-${maxSections} main sections.
                     DO NOT include Abstract or Conclusion.
                     DO NOT use subsections.
                     This is CRITICAL - the outline will be rejected if it doesn't meet these requirements.`
                  : `For ${typeString} type in ${mode} mode: Generate ${minSections}-${maxSections} ${includeSubsections ? 'total sections and subsections' : 'main sections'}.
                     ${requireAbstractConclusion ? 'Include Abstract and Conclusion sections.' : ''}`
                }`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: GROQ_CONFIG.TEMPERATURE,
          max_tokens: GROQ_CONFIG.MAX_TOKENS
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded');
        }
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('No completion content received');
      }

      return data.choices[0].message.content;
    };

    const retryWithBackoff = async (fn: () => Promise<any>, maxRetries: number = 3): Promise<any> => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error: any) {
          if (error?.message === 'Rate limit exceeded' && i < maxRetries - 1) {
            const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
            console.log(`Rate limit hit, waiting ${waitTime}ms before retry ${i + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw error;
        }
      }
      throw new Error('Max retries exceeded');
    };

    const response = await retryWithBackoff(makeRequest);
    
    // Validate section count
    const sectionCount = (response.match(/^\d+\./gm) || []).length;
    const subsectionCount = (response.match(/^\d+\.\d+\./gm) || []).length;
    const totalCount = type === ResearchType.Article ? sectionCount : (sectionCount + (includeSubsections ? subsectionCount : 0));

    console.log(`Generated outline stats:
      Type: ${typeString}
      Mode: ${mode}
      Main sections: ${sectionCount}
      Subsections: ${subsectionCount}
      Total count: ${totalCount}
      Expected range: ${minSections}-${maxSections}`);

    if (totalCount < minSections || totalCount > maxSections) {
      console.warn(`Generated outline has ${totalCount} sections, expected ${minSections}-${maxSections}. Regenerating...`);
      return generateDetailedOutline(topic, mode, type); // Recursively try again
    }

    if (type === ResearchType.Article && subsectionCount > 0) {
      console.warn('Article type contains subsections. Regenerating...');
      return generateDetailedOutline(topic, mode, type);
    }

    return response;
  } catch (error) {
    console.error('Error generating outline:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate outline: ${error.message}`);
    } else {
      throw new Error('Failed to generate outline: Unknown error');
    }
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
  try {
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
          await new Promise(resolve => setTimeout(resolve, baseDelay));
        }

        const response = await makeApiCall(
          async () => {
            const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
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
            return response.json();
          },
          'Failed to generate references'
        );

        const data = await response;
        const content = data.choices[0].message.content;
        return content.split('\n').filter(line => line.trim().length > 0);
      } catch (error) {
        if (retryCount === maxRetries - 1) {
          throw error;
        }
        console.error(`Error on attempt ${retryCount + 1}/${maxRetries}:`, error);
        retryCount++;
      }
    }

    throw new Error('Failed to generate references after maximum retries');
  } catch (error) {
    console.error('Error in generateReferences:', error);
    throw error;
  }
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
