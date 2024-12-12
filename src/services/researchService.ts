import { generateDetailedOutline, generateSection, generateReferences } from './api';
import { ResearchError, ResearchException } from './researchErrors';
import { ResearchMode, ResearchType } from '../store/slices/researchSlice';

interface OutlineItem {
  title: string;
  level: number;
  number: string;
  isSubsection: boolean;
  description?: string;
}

interface ResearchSection {
  title: string;
  content: string;
  number: string;
  warning?: string;
}

interface ResearchResult {
  sections: ResearchSection[];
  references: string[];
  outline: string;
}

export function parseDetailedOutline(outline: string): OutlineItem[] {
  const lines = outline.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const items: OutlineItem[] = [];
  let currentMainSection: OutlineItem | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines and bracket content
    if (line.length === 0 || line.startsWith('[') || line.endsWith(']')) {
      continue;
    }

    // Match section numbers (1., 2., etc.) or subsection letters (a., b., etc.) or bullets (•, -, *)
    const numberMatch = line.match(/^(\d+\.|[a-z]\.|[A-Z]\.|\•|\-|\*)\s*/);
    
    if (numberMatch) {
      const number = numberMatch[1];
      const title = line.substring(numberMatch[0].length).trim();
      const level = number.match(/^(\d+\.|[A-Z]\.)/) ? 1 : 2;
      const isSubsection = level > 1;
      
      // Look for description in the next lines
      let description = '';
      let nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Keep looking for description until we find another section or end
      while (i + 1 < lines.length && 
             !lines[i + 1].match(/^(\d+\.|[a-z]\.|[A-Z]\.|\•|\-|\*)\s*/) && 
             !lines[i + 1].startsWith('[') &&
             lines[i + 1].trim().length > 0) {
        description += (description ? ' ' : '') + lines[i + 1].trim();
        i++;
        nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      }

      const item: OutlineItem = {
        title,
        level,
        number: number.replace(/\.$/, ''),
        isSubsection,
        description: description || '[Description to be added]' // Ensure every section has a description
      };

      if (!isSubsection) {
        currentMainSection = item;
      }

      items.push(item);
    }
  }

  return items;
}

export async function generateResearch(
  topic: string,
  mode: ResearchMode,
  type: ResearchType,
  progressCallback: (progress: number, message: string) => void
): Promise<ResearchResult> {
  try {
    let sections: ResearchSection[] = [];
    let references: string[] = [];
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
    const outlineItems = parseDetailedOutline(outline);
    if (!outlineItems.length) {
      throw new ResearchException(ResearchError.PARSING_ERROR, 'Failed to parse outline');
    }

    // Generate content for each section
    let currentProgress = 20;
    const progressPerSection = 60 / outlineItems.length;
    const maxConsecutiveErrors = 3;
    console.log('Starting section generation with outline items:', outlineItems);

    for (let i = 0; i < outlineItems.length; i++) {
      const item = outlineItems[i];
      
      try {
        console.log(`Attempting to generate section ${i + 1}: ${item.title}`);
        const sectionType = item.isSubsection ? 'subsection' : 'section';
        progressCallback(
          currentProgress,
          `[${i + 1}/${outlineItems.length}] Generating ${sectionType}: "${item.title}"`
        );

        // Add base delay between sections to avoid rate limits
        if (i > 0) {
          const currentDelay = baseDelay * Math.pow(1.5, rateLimitHits);
          console.log(`Applying delay of ${currentDelay/1000} seconds before next section`);
          progressCallback(
            currentProgress,
            `[${i + 1}/${outlineItems.length}] Processing ${currentDelay/1000}s before generating "${item.title}"...`
          );
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }

        const content = await generateSection(topic, item.title, item.isSubsection);
        console.log(`Successfully generated section: ${item.title}`);
        
        const wordCount = content.split(/\s+/).length;
        const minWords = item.isSubsection ? 2000 : 3000;
        
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
      references = referencesContent.split('\n').filter(ref => ref.trim().length > 0);
      if (!references || !references.length) {
        console.warn('No references generated');
        references = [];
      }
    } catch (error) {
      console.error('Error generating references:', error);
      references = [];
    }

    progressCallback(100, 'Research generation complete!');
    return { sections, references, outline };
  } catch (error) {
    console.error('Error in generateResearch:', error);
    throw error;
  }
}
