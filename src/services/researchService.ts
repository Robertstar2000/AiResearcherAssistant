import { researchApi } from './api';
import { ResearchError, ResearchException } from './researchErrors';
import { ResearchSection } from '../store/slices/researchSlice';

// Function to create research outline
export async function createResearchOutline(topic: string, mode: string, type: string): Promise<ResearchSection[]> {
  try {
    // Generate detailed outline using researchApi
    const outline = await researchApi.generateDetailedOutline(topic, mode, type);
    
    // Parse the outline into ResearchSection array
    const parsedSections: ResearchSection[] = parseOutline(outline);
    
    return parsedSections;
  } catch (error) {
    if (error instanceof ResearchException) {
      // Handle known research exceptions
      throw error;
    } else {
      // Handle unexpected errors
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'An unexpected error occurred while creating the research outline.'
      );
    }
  }
}

// Utility function to parse outline
function parseOutline(outline: string): ResearchSection[] {
  const lines = outline.split('\n').filter(line => line.trim());
  const sections: ResearchSection[] = [];
  let currentSection: ResearchSection | null = null;

  for (const line of lines) {
    // Check if line starts with a number (section header)
    const match = line.match(/^(\d+\.?(?:\d+)?)\s*(.*)/);
    if (match) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        number: match[1],
        title: match[2].trim(),
        content: '',
        subsections: []
      };
    } else if (currentSection) {
      // Add non-header lines as content
      currentSection.content += (currentSection.content ? '\n' : '') + line.trim();
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

// Example of another function utilizing researchApi
export async function generateResearchSection(
  sectionTitle: string,
  sectionDescription: string,
  topic: string,
  mode: string,
  type: string
): Promise<string> {
  try {
    const content = await researchApi.generateSectionBatch(
      [{ sectionTitle, sectionDescription }],
      topic,
      mode,
      type
    );
    return content[0] || '';
  } catch (error) {
    if (error instanceof ResearchException) {
      // Handle known research exceptions
      throw error;
    } else {
      // Handle unexpected errors
      throw new ResearchException(
        ResearchError.GENERATION_ERROR,
        'An unexpected error occurred while generating the research section.'
      );
    }
  }
}

// Remove or comment out unused variables if any
// Example:
// const unusedVariable = 'This is unused';
