import { generateDetailedOutline, generateSection, generateReferences } from './api';
import { ResearchError, ResearchException } from './researchErrors';
import { store } from '../store';

interface OutlineItem {
  number: string;
  title: string;
  requirements: string[];
  isSubsection: boolean;
}

interface ResearchResult {
  sections: any[];
  references: string[];
  outline: string;
}

// Convert API sections to ResearchSections
const convertToResearchSections = (sections: any[]): any[] => {
  return sections.map((section, index) => ({
    number: section.number || `${index + 1}`,
    title: section.title,
    content: section.content,
    subsections: section.subsections ? convertToResearchSections(section.subsections) : undefined,
    warning: section.warning,
  }));
};

// Extract section count from outline
const getSectionCount = (outline: string): number => {
  const mainSections = outline.match(/^\d+\./gm);
  return mainSections ? mainSections.length : 0;
};

// Validate section count based on mode and type
const validateSectionCount = (count: number, mode: string, type: string): boolean => {
  switch (`${mode}-${type}`.toLowerCase()) {
    case 'basic-literature':
    case 'basic-general':
      return count >= 6 && count <= 12;
    case 'basic-experimental':
      return count >= 9 && count <= 15;
    case 'advanced-literature':
    case 'advanced-general':
      return count >= 9 && count <= 18;
    case 'advanced-experimental':
      return count >= 12 && count <= 24;
    default:
      return false;
  }
};

export async function generateResearch(
  topic: string,
  progressCallback: (progress: number, total: number, message: string) => void
): Promise<ResearchResult> {
  let sections: any[] = [];
  let references: string[] = [];
  let outline: string = '';
  let consecutiveErrors = 0;
  let rateLimitHits = 0;
  const maxRateLimitRetries = 3;
  const baseDelay = 20000; // 20 seconds base delay

  try {
    // Generate detailed outline
    progressCallback(10, 100, 'Generating detailed research outline...');
    outline = await generateDetailedOutline(`Generate a detailed outline for research on: ${topic}`);
    if (!outline) {
      throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate outline');
    }

    const sectionCount = getSectionCount(outline);
    const { mode, type } = store.getState().research;

    if (!validateSectionCount(sectionCount, mode, type)) {
      console.log(`Section count ${sectionCount} invalid for ${mode}-${type}, regenerating outline...`);
      return generateResearch(topic, progressCallback); // Retry generation
    }

    // Parse outline into sections
    progressCallback(20, 100, 'Analyzing and structuring research outline...');
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
          100,
          `[${i + 1}/${outlineItems.length}] Generating ${sectionType}: "${item.title}"`
        );

        // Add base delay between sections to avoid rate limits
        if (i > 0) {
          const currentDelay = baseDelay * Math.pow(1.5, rateLimitHits);
          console.log(`Applying delay of ${currentDelay/1000} seconds before next section`);
          progressCallback(
            currentProgress,
            100,
            `[${i + 1}/${outlineItems.length}] Processing ${currentDelay/1000}s before generating "${item.title}"...`
          );
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }

        const section = await generateSection(topic, item.title, item.isSubsection);
        console.log(`Successfully generated section: ${item.title}`);
        
        if (section.warning) {
          console.warn(`Warning for section ${item.title}:`, section.warning);
          progressCallback(
            currentProgress,
            100,
            `[${i + 1}/${outlineItems.length}] Note: ${section.warning} for "${item.title}"`
          );
        }

        if (!section || !section.content) {
          throw new ResearchException(ResearchError.GENERATION_ERROR, `Failed to generate content for section: ${item.title}`);
        }

        // Update section number
        section.number = item.number;
        
        // Add section to appropriate place in hierarchy
        if (item.isSubsection) {
          const parentNumber = item.number.split('.')[0];
          const parentSection = sections.find(s => s.number === parentNumber);
          if (parentSection) {
            parentSection.subsections = parentSection.subsections || [];
            parentSection.subsections.push(section);
            console.log(`Added subsection ${item.number} to parent ${parentNumber}`);
          } else {
            console.warn(`Could not find parent section for subsection ${item.number}`);
          }
        } else {
          sections.push(section);
          console.log(`Added main section ${item.number}`);
        }

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
              100,
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
        
        if (item.isSubsection) {
          const parentNumber = item.number.split('.')[0];
          const parentSection = sections.find(s => s.number === parentNumber);
          if (parentSection) {
            parentSection.subsections = parentSection.subsections || [];
            parentSection.subsections.push(failedSection);
          }
        } else {
          sections.push(failedSection);
        }
        
        currentProgress += progressPerSection;
        continue;
      }
    }

    // Generate references
    progressCallback(80, 100, 'Generating references...');
    try {
      references = await generateReferences(topic);
    } catch (error) {
      console.error('Error generating references:', error);
      references = [`Failed to generate references: ${error instanceof Error ? error.message : String(error)}`];
    }

    progressCallback(100, 100, 'Research generation complete');
    return {
      sections: convertToResearchSections(sections),
      references,
      outline
    };
  } catch (error) {
    console.error('Error in research generation:', error);
    throw new ResearchException(
      error instanceof ResearchException ? error.code : ResearchError.GENERATION_ERROR,
      error instanceof Error ? error.message : String(error),
      { originalError: error, topic }
    );
  }
};

const parseDetailedOutline = (outline: string): OutlineItem[] => {
  const items: OutlineItem[] = [];
  let currentSection: string[] = [];
  
  const lines = outline.split('\n').map(line => line.trim()).filter(line => line);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this is a new section/subsection
    if (/^\d+(\.\d+)?\./.test(line)) {
      // If we have a previous section, process it
      if (currentSection.length > 0) {
        const item = processOutlineSection(currentSection);
        if (item) {
          items.push(item);
        }
        currentSection = [];
      }
    }
    currentSection.push(line);
  }
  
  // Process the last section
  if (currentSection.length > 0) {
    const item = processOutlineSection(currentSection);
    if (item) {
      items.push(item);
    }
  }
  
  return items;
};

const processOutlineSection = (lines: string[]): OutlineItem | null => {
  if (lines.length === 0) return null;
  
  const titleLine = lines[0];
  const match = titleLine.match(/^(\d+(\.\d+)?)\.\s+(.+)$/);
  if (!match) {
    return null;
  }
  
  const number = match[1];
  const title = match[3];
  const requirements: string[] = [];
  
  let inRequirements = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase() === 'requirements:') {
      inRequirements = true;
    } else if (inRequirements && line.startsWith('-')) {
      requirements.push(line.substring(1).trim());
    }
  }
  
  return {
    number,
    title,
    requirements,
    isSubsection: number.includes('.')
  };
};
