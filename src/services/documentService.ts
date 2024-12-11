import { Document, Paragraph, Packer, HeadingLevel, AlignmentType } from 'docx';
import { PDFDocument } from 'pdf-lib';
import { ResearchException, ResearchError } from '../utils/exceptions';
import { Section as ResearchSection } from '../types/research';

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

// Helper functions for Word document generation
const generateHeader = (title: string): Paragraph[] => {
  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    })
  ];
};

const generateTitle = (metadata: DocumentMetadata): Paragraph[] => {
  return [
    new Paragraph({
      text: metadata.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `By ${metadata.author}`,
          break: 1
        })
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: metadata.created.toLocaleDateString(),
          break: 1
        })
      ],
      alignment: AlignmentType.CENTER,
    })
  ];
};

const generateSections = (sections: ResearchSection[]): Paragraph[] => {
  const paragraphs: Paragraph[] = [];

  sections.forEach(section => {
    paragraphs.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({
        text: section.content,
        alignment: AlignmentType.JUSTIFIED,
      })
    );

    if (section.subsections) {
      section.subsections.forEach(subsection => {
        paragraphs.push(
          new Paragraph({
            text: subsection.title,
            heading: HeadingLevel.HEADING_3,
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({
            text: subsection.content,
            alignment: AlignmentType.JUSTIFIED,
          })
        );
      });
    }
  });

  return paragraphs;
};

const generateReferences = (references: string[]): Paragraph[] => {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: 'References',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
    })
  ];

  references.forEach(reference => {
    paragraphs.push(
      new Paragraph({
        text: reference,
        alignment: AlignmentType.LEFT,
      })
    );
  });

  return paragraphs;
};

const convertToMarkdown = (sections: ResearchSection[]): string => {
  let markdown = '';
  sections.forEach(section => {
    if (section.title) {
      markdown += `# ${section.title}\n\n`;
    }
    if (section.content) {
      markdown += `${section.content}\n\n`;
    }
    if (section.subsections && section.subsections.length > 0) {
      section.subsections.forEach(subsection => {
        if (subsection.title) {
          markdown += `## ${subsection.title}\n\n`;
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
    if (line.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: line.substring(2),
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.LEFT,
        })
      );
    } else if (line.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: line.substring(3),
          heading: HeadingLevel.HEADING_3,
          alignment: AlignmentType.LEFT,
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          text: line,
          alignment: AlignmentType.JUSTIFIED,
        })
      );
    }
  });
  return paragraphs;
};

// Function to generate a Word document
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

// Function to generate a PDF document
export const generatePdfDocument = async (
  metadata: DocumentMetadata,
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  try {
    const markdown = convertToMarkdown(sections);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const { width, height } = page.getSize();
    const fontSize = 12;

    const content = `# ${metadata.title}\n\nAuthor: ${metadata.author}\n\n${markdown}\n\n# References\n\n${references.join('\n')}`;
    
    page.drawText(content, {
      x: 50,
      y: height - 50,
      size: fontSize,
      maxWidth: width - 100,
    });

    const pdfBytes = await pdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (error) {
    console.error('Error generating PDF document:', error);
    throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate PDF document');
  }
};

// Function to download a document
export const downloadDocument = (blob: Blob, filename: string) => {
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
    throw new ResearchException(
      ResearchError.GENERATION_ERROR,
      'Error downloading document',
      { error }
    );
  }
};
