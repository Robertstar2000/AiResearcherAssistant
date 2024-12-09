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

interface ResearchResult {
  sections: ResearchSection[];
  references: string[];
  outline: string;
}

interface Section {
  title: string;
  content: string;
  warning: string | null;
}

export async function generateResearch(
  topic: string,
  mode: ResearchMode = ResearchMode.Basic,
  type: ResearchType = ResearchType.Article,
  citationStyle: CitationStyle = CitationStyle.APA,
  progressCallback: (progress: number, total: number, message: string) => void
): Promise<ResearchResult> {
  let sections: Section[] = [];
  let references: string[] = [];
  let outline: string = '';
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  console.log('Starting research generation:', { mode, topic, type });
  
  const isAdvancedMode = mode.toLowerCase() === 'advanced';
  
  try {
    // Step 1: Generate outline (10% of progress)
    progressCallback(0, 100, 'Generating research outline...');
    
    if (!topic || !mode || type === undefined) {
      throw new Error('Missing required parameters: topic, mode, and type are required');
    }

    console.log('Generating outline with params:', { topic, mode, type });
    outline = await generateDetailedOutline(topic, mode, type);
    if (!outline) {
      throw new Error('Failed to generate outline: No content received');
    }

    console.log('Generated outline:', outline);
    progressCallback(10, 100, 'Outline generated. Analyzing structure...');

    const outlineItems = parseDetailedOutline(outline);
    if (!outlineItems || outlineItems.length === 0) {
      throw new Error('Failed to parse outline: No sections found');
    }
    
    // Process each section (90% of remaining progress)
    const totalSections = outlineItems.length;
    console.log(`Processing ${totalSections} sections in ${mode} mode...`);
    
    for (let i = 0; i < outlineItems.length; i++) {
      const item = outlineItems[i];
      const sectionStartProgress = Math.floor(10 + ((i) / totalSections * 90));
      
      try {
        progressCallback(
          sectionStartProgress,
          100,
          `Generating section ${i + 1} of ${totalSections}: ${item.title}`
        );
        
        console.log(`Generating section ${i + 1}/${totalSections}:`, item.title);
        
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

        // Calculate progress: 10% for outline + (current section / total sections * 90%)
        const sectionProgress = Math.floor(10 + ((i + 1) / totalSections * 90));
        progressCallback(
          sectionProgress,
          100,
          `Completed section ${i + 1} of ${totalSections}: ${item.title}`
        );
        
        console.log(`Completed section ${i + 1}/${totalSections}:`, item.title);
        consecutiveErrors = 0;
      } catch (error) {
        console.error(`Error generating section ${item.title}:`, error);
        consecutiveErrors++;
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Failed to generate section after ${MAX_CONSECUTIVE_ERRORS} consecutive attempts`);
        }
        
        sections.push({
          title: item.title,
          content: 'Error generating section content',
          warning: error instanceof Error ? error.message : 'Unknown error'
        });
        
        const sectionProgress = Math.floor(10 + ((i + 1) / totalSections * 90));
        progressCallback(
          sectionProgress,
          100,
          `Error in section ${i + 1} of ${totalSections}, continuing...`
        );
      }
      
      // Add a small delay between sections for rate limiting
      if (i < outlineItems.length - 1) {
        if (isAdvancedMode) {
          // Longer delay for advanced mode due to complexity
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        await apiWaitBetweenCalls();
      }
    }

    // Generate references
    try {
      progressCallback(95, 100, 'Generating references...');
      references = await generateReferences(topic, citationStyle);
      progressCallback(100, 100, 'Research generation complete!');
      console.log('Research generation completed successfully');
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
