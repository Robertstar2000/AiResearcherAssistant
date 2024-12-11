import { Document, Paragraph, Packer, HeadingLevel } from 'docx';
import { PDFDocument } from 'pdf-lib';
import { ResearchSection, SubSection } from '../types';

export interface DocumentMetadata {
  title: string;
  author: string;
  created: Date;
}

export interface DocumentOptions {
  title: string;
  author: string;
  sections: ResearchSection[];
  references: string[];
}

export class ResearchException extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ResearchException';
  }
}

export const ResearchError = {
  GENERATION_ERROR: 'GENERATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR'
} as const;

const convertToMarkdown = (sections: ResearchSection[]): string => {
  let markdown = '';
  sections.forEach((section, sectionIndex) => {
    if (section.title) {
      markdown += `${sectionIndex + 1}. ${section.title}\n\n`;
    }
    if (section.content) {
      markdown += `${section.content}\n\n`;
    }
    if (section.subsections && section.subsections.length > 0) {
      section.subsections.forEach((subsection: SubSection, subIndex: number) => {
        const letter = String.fromCharCode(97 + subIndex); // 97 is ASCII for 'a'
        if (subsection.title) {
          markdown += `${letter}. ${subsection.title}\n\n`;
        }
        if (subsection.content) {
          markdown += `${subsection.content}\n\n`;
        }
      });
    }
  });
  return markdown;
};

const parseMarkdownToDocx = (markdown: string): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split('\n');
  lines.forEach(line => {
    const mainSectionMatch = line.match(/^(\d+)\.\s+(.+)/);
    const subSectionMatch = line.match(/^([a-z])\.\s+(.+)/);
    
    if (mainSectionMatch) {
      paragraphs.push(
        new Paragraph({
          text: line,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        })
      );
    } else if (subSectionMatch) {
      paragraphs.push(
        new Paragraph({
          text: line,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        })
      );
    } else if (line.trim()) {
      paragraphs.push(
        new Paragraph({
          text: line,
          spacing: { after: 200 }
        })
      );
    }
  });
  return paragraphs;
};

export const generateWordDocument = async (options: DocumentOptions): Promise<Blob> => {
  try {
    const markdown = convertToMarkdown(options.sections);
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: options.title,
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 }
          }),
          new Paragraph({
            text: `Author: ${options.author}`,
            spacing: { after: 400 }
          }),
          ...parseMarkdownToDocx(markdown),
          new Paragraph({
            text: 'References',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }),
          ...options.references.map(ref => new Paragraph({
            text: ref,
            spacing: { after: 200 }
          }))
        ],
      }],
    });

    const buffer = await Packer.toBlob(doc);
    return buffer;
  } catch (error) {
    console.error('Error generating Word document:', error);
    throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate Word document');
  }
};

export const generatePdfDocument = async (
  metadata: DocumentMetadata,
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  try {
    const markdown = convertToMarkdown(sections);
    const pdf = await PDFDocument.create();
    let currentPage = pdf.addPage();
    const { width, height } = currentPage.getSize();
    const fontSize = 12;
    const titleSize = 18;
    const headerSize = 14;
    let currentY = height - 50;

    // Draw title
    currentPage.drawText(metadata.title, {
      x: 50,
      y: currentY,
      size: titleSize,
      maxWidth: width - 100,
    });
    currentY -= 30;

    // Draw author
    currentPage.drawText(`Author: ${metadata.author}`, {
      x: 50,
      y: currentY,
      size: fontSize,
      maxWidth: width - 100,
    });
    currentY -= 40;

    // Draw content
    const lines = markdown.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const isMainSection = line.match(/^\d+\.\s+/);
        const isSubSection = line.match(/^[a-z]\.\s+/);
        const lineSize = isMainSection ? headerSize : (isSubSection ? fontSize + 1 : fontSize);
        const xOffset = isSubSection ? 70 : 50;

        if (currentY < 50) {
          currentPage = pdf.addPage();
          currentY = height - 50;
        }

        currentPage.drawText(line, {
          x: xOffset,
          y: currentY,
          size: lineSize,
          maxWidth: width - (xOffset + 50),
        });
        currentY -= 20;
      }
    }

    // Draw references
    if (references.length > 0) {
      if (currentY < 100) {
        currentPage = pdf.addPage();
        currentY = height - 50;
      }

      currentY -= 20;
      currentPage.drawText('References', {
        x: 50,
        y: currentY,
        size: headerSize,
        maxWidth: width - 100,
      });
      currentY -= 30;

      for (const ref of references) {
        if (currentY < 50) {
          currentPage = pdf.addPage();
          currentY = height - 50;
        }

        currentPage.drawText(ref, {
          x: 50,
          y: currentY,
          size: fontSize,
          maxWidth: width - 100,
        });
        currentY -= 20;
      }
    }

    const pdfBytes = await pdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (error) {
    console.error('Error generating PDF document:', error);
    throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate PDF document');
  }
};

export const downloadDocument = (blob: Blob, filename: string): void => {
  try {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading document:', error);
    throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to download document');
  }
};
