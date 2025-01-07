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
      text: "Table of Contents",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 200,
        after: 100
      }
    }),
    new TableOfContents("", {
      hyperlink: true,
      headingStyleRange: "1-3",
      stylesWithLevels: [
        { level: 1, styleName: "Heading1" },
        { level: 2, styleName: "Heading2" }
      ]
    }),
    // Page break before content
    new Paragraph({
      text: '',
      pageBreakBefore: true
    })
  ];

  // Add sections with proper heading levels
  sections.forEach(section => {
    // Add section title
    children.push(
      new Paragraph({
        text: `${section.number} ${section.title}`,
        heading: HeadingLevel.HEADING_1,
        style: "Heading1",
        spacing: {
          before: 200,
          after: 100
        }
      })
    );

    // Add section content with preserved formatting
    if (section.content) {
      const paragraphs = section.content.split('\n').filter(p => p.trim());
      paragraphs.forEach(p => {
        children.push(
          new Paragraph({
            text: p.trim(),
            spacing: {
              before: 20,
              after: 20
            }
          })
        );
      });
    }

    // Add subsections
    if (section.subsections) {
      section.subsections.forEach(subsection => {
        // Add subsection title
        children.push(
          new Paragraph({
            text: `${subsection.number} ${subsection.title}`,
            heading: HeadingLevel.HEADING_2,
            style: "Heading2",
            spacing: {
              before: 100,
              after: 50
            }
          })
        );

        // Add subsection content with preserved formatting
        if (subsection.content) {
          const paragraphs = subsection.content.split('\n').filter(p => p.trim());
          paragraphs.forEach(p => {
            children.push(
              new Paragraph({
                text: p.trim(),
                spacing: {
                  before: 20,
                  after: 20
                }
              })
            );
          });
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
  _references: string[]
): Promise<Blob> => {
  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Create pages and add content
    let page = pdfDoc.addPage();
    const normalSize = 12;
    const titleSize = 24;
    const headingSize = 16;
    const subheadingSize = 14;
    const margin = 50;
    const pageWidth = page.getWidth() - 2 * margin;
    
    // Extract and format title
    const documentTitle = extractDocumentTitle(metadata.title);
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Add title page
    const titleLines = wrapText(documentTitle, boldFont, titleSize, pageWidth);
    let titleY = page.getHeight() - 150;
    
    for (const line of titleLines) {
      const titleWidth = boldFont.widthOfTextAtSize(line, titleSize);
      page.drawText(line, {
        x: (page.getWidth() - titleWidth) / 2,
        y: titleY,
        size: titleSize,
        font: boldFont
      });
      titleY -= titleSize * 1.5; // Add some spacing between title lines
    }

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
    page = pdfDoc.addPage();
    let y = page.getHeight() - 100;

    // Add TOC title
    const tocTitle = "Table of Contents";
    const tocTitleWidth = boldFont.widthOfTextAtSize(tocTitle, titleSize);
    page.drawText(tocTitle, {
      x: (page.getWidth() - tocTitleWidth) / 2,
      y,
      size: titleSize,
      font: boldFont
    });
    y -= 60;

    // Add section titles to TOC with page numbers
    let pageNum = 3; // Start from page 3 (after title and TOC)
    for (const section of sections) {
      const tocText = `${section.number} ${section.title}`;
      const pageText = pageNum.toString();
      const pageWidth = font.widthOfTextAtSize(pageText, normalSize);
      
      page.drawText(tocText, {
        x: margin,
        y,
        size: normalSize,
        font: boldFont
      });
      
      page.drawText(pageText, {
        x: page.getWidth() - margin - pageWidth,
        y,
        size: normalSize,
        font: font
      });
      
      y -= 30;
      pageNum++;

      if (section.subsections) {
        for (const subsection of section.subsections) {
          if (y < 50) {
            page = pdfDoc.addPage();
            y = page.getHeight() - 50;
          }

          const subText = `${subsection.number} ${subsection.title}`;
          const subPageText = pageNum.toString();
          const subPageWidth = font.widthOfTextAtSize(subPageText, normalSize);

          page.drawText(subText, {
            x: margin + 30,
            y,
            size: normalSize,
            font: font
          });

          page.drawText(subPageText, {
            x: page.getWidth() - margin - subPageWidth,
            y,
            size: normalSize,
            font: font
          });

          y -= 25;
          pageNum++;
        }
      }

      if (y < 50) {
        page = pdfDoc.addPage();
        y = page.getHeight() - 50;
      }
    }

    // Content pages
    for (const section of sections) {
      page = pdfDoc.addPage();
      y = page.getHeight() - margin;

      // Add section title
      const sectionTitle = `${section.number} ${section.title}`;
      page.drawText(sectionTitle, {
        x: margin,
        y,
        size: headingSize,
        font: boldFont
      });
      y -= 40;

      // Add section content with preserved formatting
      if (section.content) {
        const paragraphs = section.content.split('\n').filter(p => p.trim());
        for (const paragraph of paragraphs) {
          if (y < 50) {
            page = pdfDoc.addPage();
            y = page.getHeight() - margin;
          }

          const lines = wrapText(paragraph.trim(), font, normalSize, pageWidth);
          for (const line of lines) {
            page.drawText(line, {
              x: margin,
              y,
              size: normalSize,
              font: font
            });
            y -= 20;
          }
          y -= 20; // Extra space between paragraphs
        }
      }

      // Add subsections
      if (section.subsections) {
        for (const subsection of section.subsections) {
          if (y < 100) {
            page = pdfDoc.addPage();
            y = page.getHeight() - margin;
          }

          // Add subsection title
          const subsectionTitle = `${subsection.number} ${subsection.title}`;
          page.drawText(subsectionTitle, {
            x: margin,
            y,
            size: subheadingSize,
            font: boldFont
          });
          y -= 30;

          // Add subsection content with preserved formatting
          if (subsection.content) {
            const paragraphs = subsection.content.split('\n').filter(p => p.trim());
            for (const paragraph of paragraphs) {
              if (y < 50) {
                page = pdfDoc.addPage();
                y = page.getHeight() - margin;
              }

              const lines = wrapText(paragraph.trim(), font, normalSize, pageWidth);
              for (const line of lines) {
                page.drawText(line, {
                  x: margin,
                  y,
                  size: normalSize,
                  font: font
                });
                y -= 20;
              }
              y -= 20; // Extra space between paragraphs
            }
          }
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (error) {
    console.error('Error generating PDF:', error);
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
