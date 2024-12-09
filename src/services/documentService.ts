import { Document, Paragraph, TextRun, HeadingLevel, TableOfContents, Packer, AlignmentType } from 'docx';
import { ResearchSection } from '../store/slices/researchSlice';
import { ResearchError, ResearchException } from './researchErrors';
import pdfMake from 'pdfmake/build/pdfmake';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import 'pdfmake/build/vfs_fonts';

export interface DocumentMetadata {
  title: string;
  author: string;
  created: Date;
}

interface IDocumentOptions {
  sections: {
    properties: {
      type: 'continuous';
    };
    children: any[];
  }[];
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

// Function to generate a Word document
export const generateWordDocument = async (options: {
  title: string;
  author: string;
  sections: ResearchSection[];
  references: string[];
}): Promise<Blob> => {
  try {
    const metadata: DocumentMetadata = {
      title: options.title,
      author: options.author,
      created: new Date()
    };

    const doc = new Document({
      sections: [
        {
          properties: {
            type: 'continuous'
          },
          children: [
            ...generateHeader(metadata.title),
            ...generateTitle(metadata),
            new TableOfContents('Table of Contents'),
            ...generateSections(options.sections),
            ...generateReferences(options.references)
          ]
        }
      ]
    } as IDocumentOptions);

    return await Packer.toBlob(doc);
  } catch (error) {
    throw new ResearchException(
      ResearchError.GENERATION_ERROR,
      'Error generating Word document',
      { error }
    );
  }
};

// Function to generate a PDF document
export const generatePdfDocument = async (metadata: DocumentMetadata, sections: ResearchSection[], references: string[]): Promise<Blob> => {
  try {
    const content: Content[] = [
      { text: metadata.title, style: 'header' },
      { text: `By ${metadata.author}`, style: 'author' },
      { text: metadata.created.toLocaleDateString(), style: 'date' },
      { text: '', margin: [0, 20] },
    ];

    // Add sections
    sections.forEach(section => {
      content.push(
        { text: section.title, style: 'sectionHeader' },
        { text: section.content, style: 'sectionContent' }
      );

      if (section.subsections) {
        section.subsections.forEach(subsection => {
          content.push(
            { text: subsection.title, style: 'subsectionHeader' },
            { text: subsection.content, style: 'subsectionContent' }
          );
        });
      }
    });

    // Add references
    if (references.length > 0) {
      content.push(
        { text: '', margin: [0, 20] },
        { text: 'References', style: 'sectionHeader' },
        ...references.map(ref => ({ text: ref, style: 'reference' }))
      );
    }

    const docDefinition: TDocumentDefinitions = {
      content,
      styles: {
        header: {
          fontSize: 24,
          bold: true,
          alignment: 'center',
          margin: [0, 0, 0, 20]
        },
        author: {
          fontSize: 14,
          alignment: 'center',
          margin: [0, 0, 0, 10]
        },
        date: {
          fontSize: 12,
          alignment: 'center',
          margin: [0, 0, 0, 30]
        },
        sectionHeader: {
          fontSize: 18,
          bold: true,
          margin: [0, 20, 0, 10]
        },
        subsectionHeader: {
          fontSize: 16,
          bold: true,
          margin: [0, 15, 0, 10]
        },
        sectionContent: {
          fontSize: 12,
          margin: [0, 0, 0, 15]
        },
        subsectionContent: {
          fontSize: 12,
          margin: [0, 0, 0, 15]
        },
        reference: {
          fontSize: 12,
          margin: [0, 5, 0, 5]
        }
      }
    };

    return new Promise((resolve) => {
      pdfMake.createPdf(docDefinition).getBuffer((buffer) => {
        const blob = new Blob([buffer], { type: 'application/pdf' });
        resolve(blob);
      });
    });
  } catch (error) {
    throw new ResearchException(
      ResearchError.GENERATION_ERROR,
      'Error generating PDF document',
      { error }
    );
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
