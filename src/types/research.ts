export interface ResearchSection {
  number: string;
  title: string;
  content?: string;
  subsections?: ResearchSection[];
  markupContent?: string;
}

export type ResearchMode = 'basic' | 'advanced' | 'expert';
export type ResearchType = 'general' | 'literature' | 'experiment';
