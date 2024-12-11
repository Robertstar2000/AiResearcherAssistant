export interface SubSection {
  title: string;
  content: string;
}

export interface ResearchSection {
  title: string;
  content: string;
  subsections?: SubSection[];
}

export interface Research {
  title: string;
  sections: ResearchSection[];
  references: string[];
  mode: string;
  type: string;
}
