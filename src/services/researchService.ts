import { generateDetailedOutline, generateSection, generateReferences, OutlineItem } from './api';
import { ResearchError, ResearchException } from './researchErrors';
import { ResearchMode, ResearchType } from '../store/slices/researchSlice';

interface ResearchSection {
  title: string;
  content: string;
  number: string;
  warning?: string;
}

interface ResearchResult {
  sections: ResearchSection[];
  outline: string;
}

export async function parseDetailedOutline(
  outlineText: string,
  mode: string = 'basic',
  type: string = 'general'
): Promise<OutlineItem[]> {
  const lines = outlineText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const items: OutlineItem[] = [];
  let currentDescription: string[] = [];
  let currentItem: OutlineItem | null = null;
  let currentLevel = 0;

  for (const line of lines) {
    // Check for section headers (numbered or lettered)
    const sectionMatch = line.match(/^(\d+|[a-z])\.\s+(.+)/i);
    if (sectionMatch) {
      // Save previous item if exists
      if (currentItem) {
        currentItem.description = currentDescription.join('\n');
        items.push(currentItem);
        currentDescription = [];
      }

      // Create new item
      const isSubsection = /^[a-z]/i.test(sectionMatch[1]);
      currentItem = {
        number: sectionMatch[1],
        title: sectionMatch[2],
        description: '',
        isSubsection,
        level: isSubsection ? currentLevel + 1 : 1
      };

      if (!isSubsection) {
        currentLevel = 1;
      }
    } else if (line.startsWith('•') || line.startsWith('-')) {
      // Add bullet points to description
      if (currentItem) {
        currentDescription.push(line);
      }
    } else {
      // Add other lines to description
      if (currentItem) {
        currentDescription.push(line);
      }
    }
  }

  // Add final item
  if (currentItem) {
    currentItem.description = currentDescription.join('\n');
    items.push(currentItem);
  }

  // Ensure every section has at least a minimal description
  const processedItems = items.map(item => ({
    ...item,
    description: item.description || '[Description to be added]'
  }));

  // Get section count requirements
  const sectionCounts = {
    basic: {
      general: { min: 5, max: 7 },
      technical: { min: 6, max: 8 },
      academic: { min: 7, max: 9 },
      analysis: { min: 6, max: 8 },
      review: { min: 7, max: 9 }
    },
    advanced: {
      general: { min: 8, max: 10 },
      technical: { min: 9, max: 12 },
      academic: { min: 10, max: 13 },
      analysis: { min: 9, max: 11 },
      review: { min: 10, max: 12 }
    },
    technical: {
      general: { min: 10, max: 12 },
      technical: { min: 12, max: 15 },
      academic: { min: 11, max: 14 },
      analysis: { min: 10, max: 13 },
      review: { min: 11, max: 14 }
    },
    'literature-review': {
      general: { min: 12, max: 15 },
      technical: { min: 13, max: 16 },
      academic: { min: 14, max: 18 },
      analysis: { min: 13, max: 16 },
      review: { min: 15, max: 20 }
    }
  };

  const { min, max } = sectionCounts[mode as keyof typeof sectionCounts]?.[type as keyof (typeof sectionCounts)['basic']] 
    || sectionCounts.basic.general;

  // Count top-level sections (not subsections)
  const topLevelSections = processedItems.filter(item => !item.isSubsection).length;

  // Validate section count
  if (topLevelSections < min || topLevelSections > max) {
    console.log(`Found ${topLevelSections} top-level sections, expected ${min}-${max}`);
    throw new Error(`Generated outline has ${topLevelSections} sections, but should have between ${min} and ${max} sections. Please regenerate.`);
  }

  return processedItems;
}

export async function generateResearch(
  topic: string,
  mode: string = 'basic',
  type: string = 'general',
  progressCallback: (progress: number, message: string) => void
): Promise<ResearchResult> {
  try {
    let sections: ResearchSection[] = [];
    let outline: string = '';
    let consecutiveErrors = 0;
    let rateLimitHits = 0;
    const maxRateLimitRetries = 3;
    const baseDelay = 20000; // 20 seconds base delay

    progressCallback(0, 'Generating outline...');
    outline = await generateDetailedOutline(topic, mode, type);
    if (!outline) {
      throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate outline');
    }

    // Parse outline into sections
    progressCallback(20, 'Analyzing and structuring research outline...');
    const outlineItems = await parseDetailedOutline(outline, mode, type);
    if (!outlineItems.length) {
      throw new ResearchException(ResearchError.PARSING_ERROR, 'Failed to parse outline');
    }

    // Generate content for each section
    let currentProgress = 20;
    const progressPerSection = 60 / outlineItems.length;
    const maxConsecutiveErrors = 3;

    for (let i = 0; i < outlineItems.length; i++) {
      const item = outlineItems[i];
      
      try {
        progressCallback(
          currentProgress,
          `[${i + 1}/${outlineItems.length}] Generating section: "${item.title}"`
        );

        // Add base delay between sections to avoid rate limits
        if (i > 0) {
          const currentDelay = baseDelay * Math.pow(1.5, rateLimitHits);
          progressCallback(
            currentProgress,
            `[${i + 1}/${outlineItems.length}] Processing ${currentDelay/1000}s before generating "${item.title}"...`
          );
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }

        const content = await generateSection(
          topic,
          item.title,
          item.description || '',
          false,
          outlineItems
        );
        
        const wordCount = content.split(/\s+/).length;
        const minWords = 3000;
        
        let warning: string | undefined;
        if (wordCount < minWords) {
          warning = `Content length (${wordCount} words) is below the minimum requirement of ${minWords} words.`;
        }

        sections.push({
          title: item.title,
          content,
          number: item.number,
          warning
        });

        consecutiveErrors = 0;
        rateLimitHits = 0;
        currentProgress += progressPerSection;
      } catch (error) {
        console.error(`Error generating section ${item.title}:`, error);
        
        if (error instanceof ResearchException && error.code === ResearchError.RATE_LIMIT_ERROR) {
          rateLimitHits++;
          if (rateLimitHits <= maxRateLimitRetries) {
            const retryDelay = baseDelay * Math.pow(1.5, rateLimitHits);
            progressCallback(
              currentProgress,
              `[${i + 1}/${outlineItems.length}] Rate limit hit ${rateLimitHits}/${maxRateLimitRetries}, waiting ${retryDelay/1000} seconds before retry...`
            );
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            i--; // Retry this section
            continue;
          }
        }

        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new ResearchException(
            ResearchError.GENERATION_ERROR,
            `Multiple consecutive section generation failures after ${maxConsecutiveErrors} attempts. Last error: ${error instanceof Error ? error.message : String(error)}`,
            { originalError: error, section: item.title }
          );
        }
        
        // Add a failed section placeholder
        const failedSection = {
          title: item.title,
          content: `Failed to generate content: ${error instanceof Error ? error.message : String(error)}`,
          number: item.number,
          warning: 'Section generation failed'
        };
        
        sections.push(failedSection);
      }
    }

    // Generate references
    progressCallback(80, 'Generating references...');
    try {
      const referencesContent = await generateReferences(topic);
      const references = referencesContent.split('\n').filter(ref => ref.trim().length > 0);
      if (!references || !references.length) {
        console.warn('No references generated');
      }
    } catch (error) {
      console.error('Error generating references:', error);
    }

    progressCallback(100, 'Research generation complete!');
    return { sections, outline };
  } catch (error) {
    console.error('Error in generateResearch:', error);
    throw error;
  }
}
