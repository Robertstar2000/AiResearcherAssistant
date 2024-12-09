import { ResearchMode, ResearchType } from '../store/slices/researchSlice';

export const validateOutlineStructure = (
  outline: string, 
  mode: ResearchMode, 
  type: ResearchType
): { isValid: boolean; reason?: string } => {
  const mainSections = (outline.match(/^\d+\./gm) || []).length;
  const subsections = (outline.match(/^\d+\.\d+\./gm) || []).length;
  const subSubsections = (outline.match(/^\d+\.\d+\.\d+\./gm) || []).length;
  const totalSections = mainSections + subsections + subSubsections;

  if (mode === ResearchMode.Advanced && type !== ResearchType.Article) {
    const minMainSections = 8;
    const maxMainSections = 15;
    const minTotalSections = 25;
    const maxTotalSections = 52;
    
    const hasValidMainSections = mainSections >= minMainSections && mainSections <= maxMainSections;
    const hasValidTotalSections = totalSections >= minTotalSections && totalSections <= maxTotalSections;
    const hasSubsections = subsections >= mainSections * 2; // At least 2 subsections per main section
    const hasAbstract = outline.toLowerCase().includes('abstract');
    const hasConclusion = outline.toLowerCase().includes('conclusion');

    if (!hasValidMainSections) {
      return { isValid: false, reason: `Invalid number of main sections: ${mainSections} (required: ${minMainSections}-${maxMainSections})` };
    }
    if (!hasValidTotalSections) {
      return { isValid: false, reason: `Invalid total number of sections: ${totalSections} (required: ${minTotalSections}-${maxTotalSections})` };
    }
    if (!hasSubsections) {
      return { isValid: false, reason: `Insufficient subsections: ${subsections} (required: at least ${mainSections * 2})` };
    }
    if (!hasAbstract || !hasConclusion) {
      return { isValid: false, reason: 'Missing required Abstract or Conclusion section' };
    }
  } else if (mode === ResearchMode.Basic || type === ResearchType.Article) {
    const minSections = 3;
    const maxSections = type === ResearchType.Article ? 5 : 12;
    const hasValidSections = totalSections >= minSections && totalSections <= maxSections;
    
    if (!hasValidSections) {
      return { isValid: false, reason: `Invalid number of total sections: ${totalSections} (required: ${minSections}-${maxSections})` };
    }
  }

  return { isValid: true };
};

export interface OutlineSection {
    number: string;
    title: string;
    isSubsection: boolean;
}

export function parseDetailedOutline(outline: string): OutlineSection[] {
    const lines = outline.split('\n').filter(line => line.trim());
    const sections: OutlineSection[] = [];

    for (const line of lines) {
        const match = line.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
        if (match) {
            const [, number, title] = match;
            sections.push({
                number,
                title: title.trim(),
                isSubsection: number.includes('.')
            });
        }
    }

    return sections;
}

export function validateOutline(outline: string): boolean {
    try {
        const sections = parseDetailedOutline(outline);
        return sections.length > 0;
    } catch {
        return false;
    }
}
