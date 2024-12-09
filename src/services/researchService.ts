import { generateDetailedOutline, generateSection, generateReferences } from './api';
import { ResearchError, ResearchException } from './researchErrors';

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

export async function generateResearch(
  topic: string,
  progressCallback: (progress: number, total: number, message: string) => void
): Promise<ResearchResult> {
  let sections: any[] = [];
  let references: string[] = [];
  let outline: string = '';
  let consecutiveErrors = 0;

  try {
    // Generate detailed outline
    progressCallback(10, 100, 'Generating research outline...');
    outline = await generateDetailedOutline(topic);
    if (!outline) {
      throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate outline');
    }

    // Parse outline into sections
    progressCallback(20, 100, 'Parsing outline structure...');
    const outlineItems = parseDetailedOutline(outline);
    if (!outlineItems.length) {
      throw new ResearchException(ResearchError.PARSING_ERROR, 'Failed to parse outline');
    }

    // Generate content for each section
    let currentProgress = 20;
    const progressPerSection = 60 / outlineItems.length;

    for (let i = 0; i < outlineItems.length; i++) {
      const item = outlineItems[i];
      try {
        progressCallback(
          currentProgress,
          100,
          `Generating section ${i + 1} of ${outlineItems.length}: ${item.title}`
        );

        const section = await generateSection(topic, item.title, item.isSubsection);
        section.number = item.number;
        
        // Add section to appropriate place in hierarchy
        if (item.isSubsection) {
          const parentNumber = item.number.split('.')[0];
          const parentSection = sections.find(s => s.number === parentNumber);
          if (parentSection) {
            parentSection.subsections = parentSection.subsections || [];
            parentSection.subsections.push(section);
          }
        } else {
          sections.push(section);
        }

        consecutiveErrors = 0;
        currentProgress += progressPerSection;
      } catch (error) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          throw new ResearchException(
            ResearchError.GENERATION_ERROR,
            'Multiple consecutive section generation failures'
          );
        }
        console.error(`Error generating section ${item.title}:`, error);
      }
    }

    // Generate references
    progressCallback(80, 100, 'Generating references...');
    references = await generateReferences(topic);
    if (!references.length) {
      throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate references');
    }

    progressCallback(100, 100, 'Research generation complete!');
    return { sections, references, outline };
  } catch (error) {
    if (error instanceof ResearchException) throw error;
    throw new ResearchException(
      ResearchError.GENERATION_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
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
  
  const item = {
    number,
    title,
    requirements,
    isSubsection: number.includes('.')
  };
  
  return item;
};
