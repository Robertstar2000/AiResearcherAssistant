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
  references: string[];
  outline: string;
}

export function parseDetailedOutline(outline: string): OutlineItem[] {
  const lines = outline.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const items: OutlineItem[] = [];
  let currentDescription: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines, bracket content, and the "Research Outline" header
    if (line.length === 0 || 
        line.startsWith('[') || 
        line.endsWith(']') ||
        line.toLowerCase().includes('research outline')) {
      continue;
    }

    // Match numbered sections (e.g., "1.", "12.")
    const sectionMatch = line.match(/^(\d+)\.\s+(.+)$/);
    
    if (sectionMatch) {
      // If we were collecting a description, add it to the previous section
      if (currentDescription.length > 0 && items.length > 0) {
        items[items.length - 1].description = currentDescription.join('\n');
        currentDescription = [];
      }

      const [, number, title] = sectionMatch;
      
      items.push({
        title: title.trim(),
        number,
        description: '', // Will be populated as we process subsequent lines
        isSubsection: false,
        level: 1
      });
    } else {
      // If line starts with bullet points or is indented, it's part of the current section's description
      if (items.length > 0) {
        currentDescription.push(line);
      }
    }
  }

  // Don't forget to add the description for the last section
  if (currentDescription.length > 0 && items.length > 0) {
    items[items.length - 1].description = currentDescription.join('\n');
  }

  // Ensure every section has at least a minimal description
  return items.map(item => ({
    ...item,
    description: item.description || '[Description to be added]'
  }));
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
