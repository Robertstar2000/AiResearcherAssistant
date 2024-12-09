import { 
  generateSection, 
  generateReferences, 
  generateDetailedOutline,
  waitBetweenCalls as apiWaitBetweenCalls
} from './api';

import { ResearchMode, ResearchType, CitationStyle, ResearchSection } from '../store/slices/researchSlice'

interface OutlineItem {
  number: string;
  title: string;
  requirements: string[];
  isSubsection: boolean;
}

export const generateResearch = async (
  topic: string,
  mode: ResearchMode = ResearchMode.Basic,
  type: ResearchType = ResearchType.Article,
  citationStyle: CitationStyle = CitationStyle.APA,
  progressCallback: (completed: number, total: number, message: string) => void
): Promise<{ sections: ResearchSection[]; references: string[]; outline: string }> => {
  const MAX_CONSECUTIVE_ERRORS = 3;
  let consecutiveErrors = 0;
  const sections: ResearchSection[] = [];
  let references: string[] = [];
  let outline: string = '';

  try {
    // Generate outline
    progressCallback(0, 1, 'Generating outline...');
    
    if (!topic || !mode || type === undefined) {
      throw new Error('Missing required parameters: topic, mode, and type are required');
    }

    console.log('Generating outline with params:', { topic, mode, type });
    outline = await generateDetailedOutline(topic, mode, type);
    if (!outline) {
      throw new Error('Failed to generate outline: No content received');
    }

    const outlineItems = parseDetailedOutline(outline);
    if (!outlineItems || outlineItems.length === 0) {
      throw new Error('Failed to parse outline: No sections found');
    }
    
    // Calculate total steps (outline items + references)
    const totalSteps = outlineItems.length + 1;
    let completedSteps = 0;
    
    progressCallback(completedSteps, totalSteps, 'Starting research generation...');

    // Process each section
    for (let i = 0; i < outlineItems.length; i++) {
      const item = outlineItems[i];
      try {
        const { content, warning } = await generateSection(
          topic,
          item.title,
          citationStyle,
          item.isSubsection
        );

        sections.push({
          title: item.title,
          content,
          warning: warning || null
        });

        completedSteps++;
        progressCallback(completedSteps, totalSteps, `Generated section ${completedSteps} of ${totalSteps - 1}...`);
        
        // Reset consecutive errors on success
        consecutiveErrors = 0;
      } catch (error) {
        console.error(`Error generating section ${item.title}:`, error);
        consecutiveErrors++;
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Failed to generate section after ${MAX_CONSECUTIVE_ERRORS} consecutive attempts`);
        }
        
        // Add error placeholder
        sections.push({
          title: item.title,
          content: 'Error generating section content',
          warning: error instanceof Error ? error.message : 'Unknown error'
        });
        
        completedSteps++;
        progressCallback(completedSteps, totalSteps, `Error in section ${completedSteps}, continuing...`);
      }
      
      // Wait between API calls to avoid rate limits
      if (i < outlineItems.length - 1) {
        await apiWaitBetweenCalls();
      }
    }

    // Generate references
    try {
      progressCallback(totalSteps - 1, totalSteps, 'Generating references...');
      references = await generateReferences(topic, citationStyle);
      completedSteps++;
      progressCallback(completedSteps, totalSteps, 'Research generation complete!');
    } catch (error) {
      console.error('Error generating references:', error);
      references = ['Error generating references'];
    }

    return { sections, references, outline };
  } catch (error) {
    console.error('Error in research generation:', error);
    throw error;
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
