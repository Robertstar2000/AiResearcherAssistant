import { Document, Paragraph, HeadingLevel, AlignmentType, TableOfContents } from 'docx';
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

// Extract and clean document title from research target
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
    titleEnd = researchTarget.length;
  } else if (asteriskEnd === -1) {
    titleEnd = newlineEnd;
  } else if (newlineEnd === -1) {
    titleEnd = asteriskEnd;
  } else {
    titleEnd = Math.min(asteriskEnd, newlineEnd);
  }
  
  let title = researchTarget.substring(startIndex, titleEnd).trim();
  
  // Remove quotation marks
  title = title.replace(/['"]/g, '');
  
  // Check for groups of spaces and truncate if found
  const spaceGroupMatch = title.match(/\s{4,}/);
  if (spaceGroupMatch) {
    title = title.substring(0, spaceGroupMatch.index).trim();
  }
  
  return title;
};

export const generateWordDocument = (sections: ResearchSection[], title: string): Document => {
  const documentTitle = extractDocumentTitle(title);
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  // Create title page
  const children = [
    // Title Page
    new Paragraph({
      text: documentTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 400,
        after: 200
      },
      style: "Title",
      run: {
        size: 72 // 36pt = 72 half-points
      }
    }),
    new Paragraph({
      text: "Written by the AI Researcher application",
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 200,
        after: 50
      }
    }),
    new Paragraph({
      text: "developed by MIFECOinc@gmail.com",
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 50,
        after: 100
      }
    }),
    new Paragraph({
      text: currentDate,
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 100,
        after: 200
      }
    }),
    // Page break before Table of Contents
    new Paragraph({
      text: '',
      pageBreakBefore: true
    }),
    // Table of Contents page
    new Paragraph({
      text: documentTitle,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 200,
        after: 200
      }
    }),
    new Paragraph({
      text: '',
      spacing: {
        after: 200
      }
    }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3"
    }),
    // Page break before content
    new Paragraph({
      text: '',
      pageBreakBefore: true
    })
  ];

  // Add sections with proper heading levels
  sections.forEach(section => {
    children.push(
      new Paragraph({
        text: `${section.number}. ${section.title}`,
        heading: HeadingLevel.HEADING_1,
        spacing: {
          before: 200,
          after: 100
        }
      })
    );

    if (section.content) {
      children.push(
        new Paragraph({
          text: section.content,
          spacing: {
            after: 100
          }
        })
      );
    }

    if (section.subsections) {
      section.subsections.forEach(subsection => {
        children.push(
          new Paragraph({
            text: `${subsection.number}. ${subsection.title}`,
            heading: HeadingLevel.HEADING_2,
            spacing: {
              before: 100,
              after: 50
            }
          })
        );

        if (subsection.content) {
          children.push(
            new Paragraph({
              text: subsection.content,
              spacing: {
                after: 50
              }
            })
          );
        }
      });
    }
  });

  return new Document({
    sections: [{
      properties: {},
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
    
    // Extract and format title
    const documentTitle = extractDocumentTitle(metadata.title);
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Add title page
    const titleWidth = boldFont.widthOfTextAtSize(documentTitle, 36);
    page.drawText(documentTitle, {
      x: (page.getWidth() - titleWidth) / 2,
      y: page.getHeight() - 150,
      size: 36,
      font: boldFont
    });

    // Add author lines
    const authorLine1 = "Written by the AI Researcher application";
    const authorLine2 = "developed by MIFECOinc@gmail.com";
    const authorWidth1 = font.widthOfTextAtSize(authorLine1, normalSize);
    const authorWidth2 = font.widthOfTextAtSize(authorLine2, normalSize);
    page.drawText(authorLine1, {
      x: (page.getWidth() - authorWidth1) / 2,
      y: page.getHeight() - 250,
      size: normalSize,
      font: font
    });
    page.drawText(authorLine2, {
      x: (page.getWidth() - authorWidth2) / 2,
      y: page.getHeight() - 280,
      size: normalSize,
      font: font
    });

    // Add date
    const dateWidth = font.widthOfTextAtSize(currentDate, normalSize);
    page.drawText(currentDate, {
      x: (page.getWidth() - dateWidth) / 2,
      y: page.getHeight() - 350,
      size: normalSize,
      font: font
    });

    // Add Table of Contents page
    let tocPage = pdfDoc.addPage();
    let tocY = tocPage.getHeight() - 100;
  
    // Add document title to TOC page
    const tocTitleWidth = boldFont.widthOfTextAtSize(documentTitle, 24);
    tocPage.drawText(documentTitle, {
      x: (page.getWidth() - tocTitleWidth) / 2,
      y: tocY,
      size: 24,
      font: boldFont
    });
    tocY -= 100;  // Space after title

    // Add section titles to TOC
    for (const section of sections) {
      const tocText = `${section.number}. ${section.title}`;
      tocPage.drawText(tocText, {
        x: 50,  // Indent from left
        y: tocY,
        size: normalSize,
        font: boldFont
      });
      tocY -= 30;  // Space between sections

      // Add subsections if they exist
      if (section.subsections) {
        for (const subsection of section.subsections) {
          const subText = `    ${subsection.number}. ${subsection.title}`;
          tocPage.drawText(subText, {
            x: 70,  // More indent for subsections
            y: tocY,
            size: normalSize,
            font: font
          });
          tocY -= 25;  // Slightly less space between subsections
        }
      }
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
