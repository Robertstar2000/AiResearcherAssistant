export interface SubSection {
  title: string;
  content: string;
  number?: string;
}

export interface ResearchSection {
  title: string;
  content: string;
  subsections?: SubSection[];
  number?: string;
}

export interface Research {
  title: string;
  sections: ResearchSection[];
  references: string[];
  mode: string;
  type: string;
}
