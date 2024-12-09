import { ResearchSection } from '../store/slices/researchSlice';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, SectionType, AlignmentType, PageNumber, TableOfContents, Header } from 'docx';
import pdfMake from 'pdfmake/build/pdfmake';
import 'pdfmake/build/vfs_fonts';

interface DocumentMetadata {
  title: string;
  author: string;
  date: string;
}

export const generateMarkup = async (
  metadata: DocumentMetadata,
  sections: ResearchSection[],
  references: string[]
): Promise<string> => {
  let markdown = '';

  // Title Page
  markdown += `# ${metadata.title}\n\n\n\n\n\n`;  // 6 line feeds before author
  markdown += `**Author:** ${metadata.author}\n`;
  markdown += `**Date:** ${metadata.date}\n\n`;
  markdown += '\\pagebreak\n\n';  // Page break after title page

  // Table of Contents
  markdown += '## Table of Contents\n\n';
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    markdown += `* ${sectionNumber}. ${section.title}\n`;
    if (section.subsections?.length) {
      section.subsections.forEach((subsection, subIndex) => {
        const subsectionNumber = `${sectionNumber}.${subIndex + 1}`;
        markdown += `  * ${subsectionNumber}. ${subsection.title}\n`;
      });
    }
  });
  markdown += '\n\\pagebreak\n\n';  // Page break after table of contents

  // Content
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    markdown += `## ${sectionNumber}. ${section.title}\n\n`;
    markdown += `${section.content}\n\n`;

    if (section.subsections?.length) {
      section.subsections.forEach((subsection, subIndex) => {
        const subsectionNumber = `${sectionNumber}.${subIndex + 1}`;
        markdown += `### ${subsectionNumber}. ${subsection.title}\n\n`;
        markdown += `${subsection.content}\n\n`;
      });
    }
  });

  // References
  if (references.length > 0) {
    markdown += '\n\\pagebreak\n\n';  // Page break before references
    markdown += '## References\n\n';
    references.forEach(ref => {
      markdown += `* ${ref}\n\n`;  // Line feed after each citation
    });
  }

  return markdown;
};

export const generatePDF = async (
  metadata: DocumentMetadata,
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  try {
    const content: any[] = [];
    
    // Title page
    content.push(
      {
        text: metadata.title,
        style: 'title',
        alignment: 'center',
      },
      {
        text: `\n\nAuthor: ${metadata.author}\nDate: ${metadata.date}`,
        style: 'author',
        alignment: 'center',
      },
      {
        text: '',
        pageBreak: 'after'
      }
    );

    // Table of Contents
    content.push(
      {
        text: 'Table of Contents',
        style: 'tocHeader',
        pageBreak: 'before'
      }
    );

    // Add TOC entries
    sections.forEach((section, index) => {
      content.push({
        text: `${index + 1}. ${section.title}`,
        style: 'toc1',
        tocItem: true
      });

      if (section.subsections?.length) {
        section.subsections.forEach((subsection, subIndex) => {
          content.push({
            text: `    ${index + 1}.${subIndex + 1}. ${subsection.title}`,
            style: 'toc2',
            tocItem: true
          });
        });
      }
    });

    content.push({ text: '', pageBreak: 'after' });

    // Content sections
    sections.forEach((section, index) => {
      content.push({
        text: `${index + 1}. ${section.title}`,
        style: 'heading1',
        tocItem: true
      });
      content.push({
        text: section.content,
        style: 'content',
      });

      if (section.subsections?.length) {
        section.subsections.forEach((subsection, subIndex) => {
          content.push({
            text: `${index + 1}.${subIndex + 1}. ${subsection.title}`,
            style: 'heading2',
            tocItem: true
          });
          content.push({
            text: subsection.content,
            style: 'content',
          });
        });
      }
    });

    // References
    if (references.length > 0) {
      content.push({
        text: 'References',
        style: 'heading1',
        tocItem: true,
        pageBreak: 'before'
      });
      references.forEach(ref => {
        content.push({
          text: ref,
          style: 'reference'
        });
      });
    }

    const docDefinition = {
      content: content,
      styles: {
        title: {
          fontSize: 24,
          bold: true,
          margin: [0, 250, 0, 0]
        },
        author: {
          fontSize: 12,
          margin: [0, 50, 0, 0]
        },
        tocHeader: {
          fontSize: 20,
          bold: true,
          margin: [0, 0, 0, 20]
        },
        toc1: {
          fontSize: 12,
          margin: [0, 3, 0, 3]
        },
        toc2: {
          fontSize: 11,
          margin: [0, 3, 0, 3],
          color: 'grey'
        },
        heading1: {
          fontSize: 16,
          bold: true,
          margin: [0, 20, 0, 10]
        },
        heading2: {
          fontSize: 14,
          bold: true,
          margin: [0, 15, 0, 10]
        },
        content: {
          fontSize: 12,
          margin: [0, 0, 0, 15],
          lineHeight: 1.3
        },
        reference: {
          fontSize: 11,
          margin: [0, 0, 0, 10],
          lineHeight: 1.2
        }
      },
      pageSize: 'A4',
      pageMargins: [72, 72, 72, 72],
      footer: function(currentPage: number) {
        return currentPage === 1 ? null : {
          text: currentPage.toString(),
          alignment: 'center',
          margin: [0, 20]
        };
      },
      header: function(currentPage: number) {
        return currentPage <= 2 ? null : {
          text: metadata.title,
          alignment: 'right',
          margin: [72, 20, 72, 20],
          fontSize: 10,
          color: 'grey'
        };
      }
    };

    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = pdfMake.createPdf(docDefinition);
        pdfDoc.getBlob((blob: Blob) => {
          if (!blob) {
            reject(new Error('Failed to generate PDF blob'));
            return;
          }
          resolve(blob);
        }, (error: any) => {
          console.error('Error in PDF generation:', error);
          reject(error);
        });
      } catch (error) {
        console.error('Error creating PDF:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

export const generateDOCX = async (
  metadata: DocumentMetadata,
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  try {
    // Title page section
    const titleSection = {
      properties: {
        type: SectionType.NEXT_PAGE
      },
      children: [
        new Paragraph({
          text: metadata.title,
          heading: HeadingLevel.TITLE,
          spacing: { before: 3000, after: 400 },
          alignment: AlignmentType.CENTER
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Author: ${metadata.author}`,
              size: 24
            })
          ],
          spacing: { before: 400 },
          alignment: AlignmentType.CENTER
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Date: ${metadata.date}`,
              size: 24
            })
          ],
          spacing: { before: 200 },
          alignment: AlignmentType.CENTER
        })
      ]
    };

    // Create header with page number and auto-updating fields
    const header = new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              children: ['Page ', PageNumber.CURRENT],
            }),
          ],
        }),
      ],
    });

    // Table of Contents section
    const tocSection = {
      properties: {
        type: SectionType.NEXT_PAGE
      },
      children: [
        new Paragraph({
          text: "Table of Contents",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 400 },
          alignment: AlignmentType.CENTER
        }),
        new TableOfContents("Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-5",
          stylesWithLevels: [
            { level: 1, styleId: "Heading1" },
            { level: 2, styleId: "Heading2" },
            { level: 3, styleId: "Heading3" },
          ],
          updateFields: true
        })
      ]
    };

    // Content sections with proper heading styles
    const contentSections = sections.map((section, index) => {
      const sectionChildren = [
        new Paragraph({
          text: `${index + 1}. ${section.title}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        }),
        new Paragraph({
          text: section.content,
          spacing: { before: 200, after: 200 }
        })
      ];

      if (section.subsections?.length) {
        section.subsections.forEach((subsection, subIndex) => {
          sectionChildren.push(
            new Paragraph({
              text: `${index + 1}.${subIndex + 1}. ${subsection.title}`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 200 }
            }),
            new Paragraph({
              text: subsection.content,
              spacing: { before: 200, after: 200 }
            })
          );
        });
      }

      return {
        properties: {
          type: SectionType.CONTINUOUS
        },
        children: sectionChildren
      };
    });

    // References section
    const referencesSection = {
      properties: {
        type: SectionType.NEXT_PAGE
      },
      children: [
        new Paragraph({
          text: "References",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 400 }
        }),
        ...references.map(ref => new Paragraph({
          text: ref,
          spacing: { before: 200, after: 200 }
        }))
      ]
    };

    const doc = new Document({
      features: {
        updateFields: true
      },
      sections: [
        titleSection,
        tocSection,
        ...contentSections,
        referencesSection
      ],
      styles: {
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 28,
              bold: true
            },
            paragraph: {
              spacing: { before: 240, after: 120 }
            }
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 26,
              bold: true
            },
            paragraph: {
              spacing: { before: 240, after: 120 }
            }
          },
          {
            id: "Heading3",
            name: "Heading 3",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 24,
              bold: true
            },
            paragraph: {
              spacing: { before: 240, after: 120 }
            }
          }
        ]
      }
    });

    return Packer.toBlob(doc);
  } catch (error) {
    console.error('Error generating DOCX:', error);
    throw error;
  }
};

export const downloadDocument = (blob: Blob, filename: string) => {
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Error downloading document:', error);
    throw error;
  }
};
