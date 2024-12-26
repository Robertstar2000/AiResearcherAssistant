import { Document, Paragraph, HeadingLevel, AlignmentType } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ResearchSection } from '../types/research';

class ResearchException extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ResearchException';
  }
}

const ResearchError = {
  GENERATION_ERROR: 'GENERATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR'
} as const;

export const convertToMarkdown = (sections: ResearchSection[]): string => {
  let markdown = '';
  sections.forEach(section => {
    markdown += `# ${section.number}. ${section.title}\n\n`;
    if (section.content) {
      markdown += `${section.content}\n\n`;
    }
    if (section.subsections && section.subsections.length > 0) {
      section.subsections.forEach(subsection => {
        markdown += `## ${subsection.number}. ${subsection.title}\n\n`;
        if (subsection.content) {
          markdown += `${subsection.content}\n\n`;
        }
      });
    }
  });
  return markdown;
};

export const parseMarkdownToDocx = (markdown: string): ResearchSection[] => {
  const lines = markdown.split('\n');
  const sections: ResearchSection[] = [];
  let currentSection: ResearchSection | undefined;
  let currentSubSection: ResearchSection | undefined;

  lines.forEach(line => {
    if (line.startsWith('# ')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const titleMatch = line.match(/^# (\d+)\. (.+)$/);
      if (titleMatch) {
        currentSection = {
          number: titleMatch[1] || '0',
          title: titleMatch[2].trim(),
          content: '',
          subsections: []
        };
        currentSubSection = undefined;
      }
    } else if (line.startsWith('## ') && currentSection) {
      if (currentSubSection) {
        currentSection.subsections?.push(currentSubSection);
      }
      const subTitleMatch = line.match(/^## (\d+(?:\.\d+)?)\. (.+)$/);
      if (subTitleMatch) {
        currentSubSection = {
          number: subTitleMatch[1] || '0',
          title: subTitleMatch[2].trim(),
          content: ''
        };
      }
    } else if (line.trim()) {
      if (currentSubSection) {
        currentSubSection.content = ((currentSubSection.content || '') + line + '\n').trim();
      } else if (currentSection) {
        currentSection.content = ((currentSection.content || '') + line + '\n').trim();
      }
    }
  });

  if (currentSection) {
    if (currentSubSection) {
      currentSection.subsections?.push(currentSubSection);
    }
    sections.push(currentSection);
  }

  return sections;
};

const wrapText = (text: string, font: any, fontSize: number, maxWidth: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = font.widthOfTextAtSize(`${currentLine} ${word}`, fontSize);
    
    if (width < maxWidth) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  
  lines.push(currentLine);
  return lines;
};

// Extract document title from research target
const extractDocumentTitle = (researchTarget: string): string => {
  const titleStart = researchTarget.indexOf("Title: ");
  if (titleStart === -1) {
    return researchTarget; // Return full text if start marker not found
  }
  
  const startIndex = titleStart + 7;
  const asteriskEnd = researchTarget.indexOf("**", startIndex);
  const newlineEnd = researchTarget.indexOf("\n", startIndex);
  
  let titleEnd;
  if (asteriskEnd === -1 && newlineEnd === -1) {
    return researchTarget.substring(startIndex).trim();
  } else if (asteriskEnd === -1) {
    titleEnd = newlineEnd;
  } else if (newlineEnd === -1) {
    titleEnd = asteriskEnd;
  } else {
    titleEnd = Math.min(asteriskEnd, newlineEnd);
  }
  
  return researchTarget.substring(startIndex, titleEnd).trim();
};

export const generateWordDocument = (sections: ResearchSection[], title: string): Document => {
  const documentTitle = extractDocumentTitle(title);
  
  // Create title page
  const children = [
    new Paragraph({
      text: documentTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400,
        before: 400
      }
    }),
    // Add page break after title
    new Paragraph({
      text: '',
      pageBreakBefore: true
    }),
    // Add Table of Contents title
    new Paragraph({
      text: "Table of Contents",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400
      }
    })
  ];

  // Add TOC entries
  sections.forEach((section, sectionIndex) => {
    // Add section entry with number
    children.push(
      new Paragraph({
        text: `${sectionIndex + 1}. ${section.title}`,
        style: "TOC1",
        spacing: { after: 200 }
      })
    );
    
    if (section.subsections) {
      section.subsections.forEach((subsection, subsectionIndex) => {
        children.push(
          new Paragraph({
            text: `${sectionIndex + 1}.${subsectionIndex + 1}. ${subsection.title}`,
            style: "TOC2",
            spacing: { after: 200 }
          })
        );
      });
    }
  });

  // Add page break after TOC
  children.push(
    new Paragraph({
      text: '',
      pageBreakBefore: true
    })
  );

  // Add sections content
  sections.forEach((section) => {
    children.push(
      new Paragraph({
        text: "",
        spacing: { before: 400 }
      }),
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 }
      }),
      new Paragraph({
        text: section.content,
        spacing: { after: 300 }
      })
    );

    if (section.subsections) {
      section.subsections.forEach((subsection) => {
        children.push(
          new Paragraph({
            text: subsection.title,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 }
          }),
          new Paragraph({
            text: subsection.content,
            spacing: { after: 200 }
          })
        );
      });
    }
  });

  return new Document({
    styles: {
      default: {
        heading1: {
          run: {
            size: 36,
            bold: true,
          },
          paragraph: {
            spacing: { after: 300 }
          }
        }
      },
      paragraphStyles: [
        {
          id: "TOC1",
          name: "TOC 1",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 28
          },
          paragraph: {
            spacing: { after: 100 }
          }
        },
        {
          id: "TOC2",
          name: "TOC 2",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 26
          },
          paragraph: {
            spacing: { after: 100 },
            indent: { left: 720 }
          }
        }
      ]
    },
    sections: [{
      children: children
    }]
  });
};

export const generatePdfDocument = async (
  metadata: { title: string },
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Create pages and add content
    let page = pdfDoc.addPage();
    const normalSize = 12;
    
    // Extract and add title
    const documentTitle = extractDocumentTitle(metadata.title);
    page.drawText(documentTitle, {
      x: 50,
      y: page.getHeight() - 150,
      size: 24,
      font: boldFont
    });

    // Add Table of Contents page
    let tocPage = pdfDoc.addPage();
    let tocY = tocPage.getHeight() - 100;
  
    // Add TOC header centered
    const tocTitle = "Table of Contents";
    const tocTitleWidth = boldFont.widthOfTextAtSize(tocTitle, 24);
    tocPage.drawText(tocTitle, {
      x: (tocPage.getWidth() - tocTitleWidth) / 2,
      y: tocY,
      size: 24,
      font: boldFont
    });
    tocY -= 80;

    // Add TOC entries
    let sectionNumber = 1;
    for (const section of sections) {
      // Add section entry with number
      tocPage.drawText(`${sectionNumber}. ${section.title}`, {
        x: 50,
        y: tocY,
        size: 14,
        font: boldFont
      });
      tocY -= 40;

      if (section.subsections) {
        let subsectionNumber = 1;
        for (const subsection of section.subsections) {
          // Add subsection entry with hierarchical number
          tocPage.drawText(`${sectionNumber}.${subsectionNumber}. ${subsection.title}`, {
            x: 70,
            y: tocY,
            size: 12,
            font: font
          });
          tocY -= 40;
          subsectionNumber++;

          // Add new page if needed
          if (tocY < 50) {
            tocPage = pdfDoc.addPage();
            tocY = tocPage.getHeight() - 50;
          }
        }
      }
      sectionNumber++;
    }

    // Start content on new page
    page = pdfDoc.addPage();

    // Add content pages
    for (const section of sections) {
      if (page.getY() < 50) {
        page = pdfDoc.addPage();
      }

      // Add section title
      const sectionTitle = `${section.number}. ${section.title}`;
      page.drawText(sectionTitle, {
        x: 50,
        y: page.getHeight() - 150,
        font: boldFont,
        size: 16
      });

      // Add section content
      if (section.content) {
        const lines = wrapText(section.content, font, normalSize, page.getWidth() - 100);
        for (const line of lines) {
          if (page.getY() < 50) {
            page = pdfDoc.addPage();
          }

          page.drawText(line, {
            x: 50,
            y: page.getY() - 20,
            font: font,
            size: normalSize
          });
        }
      }

      // Add subsections
      if (section.subsections) {
        for (const subsection of section.subsections) {
          if (page.getY() < 50) {
            page = pdfDoc.addPage();
          }

          // Add subsection title
          page.drawText(subsection.title, {
            x: 50,
            y: page.getY() - 20,
            font: boldFont,
            size: 14
          });

          // Add subsection content
          if (subsection.content) {
            const lines = wrapText(subsection.content, font, normalSize, page.getWidth() - 100);
            for (const line of lines) {
              if (page.getY() < 50) {
                page = pdfDoc.addPage();
              }

              page.drawText(line, {
                x: 50,
                y: page.getY() - 20,
                font: font,
                size: normalSize
              });
            }
          }
        }
      }
    }

    // Add references if any
    if (references.length > 0) {
      if (page.getY() < 100) {
        page = pdfDoc.addPage();
      }

      page.drawText('References', {
        x: 50,
        y: page.getY() - 20,
        font: boldFont,
        size: 16
      });

      for (const ref of references) {
        const lines = wrapText(ref, font, normalSize, page.getWidth() - 100);
        for (const line of lines) {
          if (page.getY() < 50) {
            page = pdfDoc.addPage();
          }

          page.drawText(line, {
            x: 50,
            y: page.getY() - 20,
            font: font,
            size: normalSize
          });
        }
      }
    }

    return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
  } catch (error) {
    console.error('Error generating PDF document:', error);
    throw error;
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
