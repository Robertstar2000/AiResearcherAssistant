import { Document, Paragraph, Packer, HeadingLevel, AlignmentType } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
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
        const letter = String.fromCharCode(97 + subIndex);
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
          // Title Page
          new Paragraph({
            text: options.title,
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 },
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({
            text: `By ${options.author}`,
            spacing: { after: 200 },
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({
            text: new Date().toLocaleDateString(),
            spacing: { after: 800 },
            alignment: AlignmentType.CENTER
          }),
          // Table of Contents
          new Paragraph({
            text: 'Table of Contents',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }),
          ...options.sections.map((section, index) => 
            new Paragraph({
              text: `${index + 1}. ${section.title}`,
              spacing: { after: 100 },
              tabStops: [{ type: 'right', position: 5500 }],
              style: 'tableOfContents'
            })
          ),
          new Paragraph({
            text: '',
            spacing: { after: 400 }
          }),
          // Content
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
    
    // Embed a standard font
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
    
    // Title Page
    let currentPage = pdf.addPage();
    const { width, height } = currentPage.getSize();
    const fontSize = 12;
    const titleSize = 24;
    const headerSize = 16;
    let currentY = height - 100; // Adjusted Y position for better title placement

    // Draw title centered with proper width calculation
    const title = metadata.title;
    const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
    const titleX = Math.max(50, (width - titleWidth) / 2); // Ensure minimum margin of 50
    currentPage.drawText(title, {
      x: titleX,
      y: currentY,
      font: boldFont,
      size: titleSize
    });
    currentY -= 60;

    // Draw author centered
    const authorText = `By ${metadata.author}`;
    const authorWidth = font.widthOfTextAtSize(authorText, fontSize + 2);
    currentPage.drawText(authorText, {
      x: (width - authorWidth) / 2,
      y: currentY,
      font: font,
      size: fontSize + 2
    });
    currentY -= 40;

    // Draw date centered
    const dateText = metadata.created.toLocaleDateString();
    const dateWidth = font.widthOfTextAtSize(dateText, fontSize);
    currentPage.drawText(dateText, {
      x: (width - dateWidth) / 2,
      y: currentY,
      font: font,
      size: fontSize
    });

    // Table of Contents Page
    currentPage = pdf.addPage();
    currentY = height - 100;

    // Draw Table of Contents header
    const tocTitle = 'Table of Contents';
    const tocTitleWidth = boldFont.widthOfTextAtSize(tocTitle, headerSize);
    currentPage.drawText(tocTitle, {
      x: Math.max(50, (width - tocTitleWidth) / 2),
      y: currentY,
      font: boldFont,
      size: headerSize
    });
    currentY -= 50;

    // Draw table of contents entries with page numbers
    let pageCounter = 3; // Start from page 3 (after title and TOC)
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const entry = `${i + 1}. ${section.title}`;
      const pageNum = `${pageCounter}`;
      const entryWidth = font.widthOfTextAtSize(entry, fontSize);
      const pageNumWidth = font.widthOfTextAtSize(pageNum, fontSize);
      const dotWidth = font.widthOfTextAtSize('.', fontSize);
      const availableWidth = width - 140 - pageNumWidth; // 70 margin on each side
      
      // Calculate dots
      const dotsCount = Math.floor((availableWidth - entryWidth) / dotWidth);
      const dots = '.'.repeat(Math.max(0, dotsCount));

      if (currentY < 50) {
        currentPage = pdf.addPage();
        currentY = height - 100;
      }

      // Draw entry
      currentPage.drawText(entry, {
        x: 70,
        y: currentY,
        font: font,
        size: fontSize
      });

      // Draw dots
      currentPage.drawText(dots, {
        x: 70 + entryWidth,
        y: currentY,
        font: font,
        size: fontSize
      });

      // Draw page number
      currentPage.drawText(pageNum, {
        x: width - 70 - pageNumWidth,
        y: currentY,
        font: font,
        size: fontSize
      });

      currentY -= 30;
      pageCounter++; // Increment page counter for next section
    }

    // Content pages
    currentPage = pdf.addPage();
    currentY = height - 100;

    // Draw content
    const lines = markdown.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const isMainSection = line.match(/^\d+\.\s+/);
        const isSubSection = line.match(/^[a-z]\.\s+/);
        const lineFont = isMainSection ? boldFont : font;
        const lineSize = isMainSection ? headerSize : (isSubSection ? fontSize + 2 : fontSize);
        const xOffset = isSubSection ? 70 : 50;
        const lineHeight = lineFont.heightAtSize(lineSize);
        const wrappedText = wrapText(line, lineFont, lineSize, width - (xOffset + 100));

        // Check if we need a new page
        if (currentY - (lineHeight * wrappedText.length) < 50) {
          currentPage = pdf.addPage();
          currentY = height - 100;
        }

        // Draw each line of wrapped text
        for (const textLine of wrappedText) {
          currentPage.drawText(textLine, {
            x: xOffset,
            y: currentY,
            font: lineFont,
            size: lineSize
          });
          currentY -= lineHeight * 1.2; // Add 20% extra spacing between lines
        }
        
        // Add extra spacing after sections
        if (isMainSection) {
          currentY -= lineHeight;
        }
      }
    }

    // Draw references
    if (references.length > 0) {
      if (currentY < 200) {
        currentPage = pdf.addPage();
        currentY = height - 100;
      }

      const refsTitle = 'References';
      currentPage.drawText(refsTitle, {
        x: 50,
        y: currentY,
        font: boldFont,
        size: headerSize
      });
      currentY -= 50;

      for (const ref of references) {
        const refHeight = font.heightAtSize(fontSize);
        const wrappedRef = wrapText(ref, font, fontSize, width - 160);

        if (currentY - (refHeight * wrappedRef.length) < 50) {
          currentPage = pdf.addPage();
          currentY = height - 100;
        }

        for (const refLine of wrappedRef) {
          currentPage.drawText(refLine, {
            x: 70,
            y: currentY,
            font: font,
            size: fontSize
          });
          currentY -= refHeight * 1.2;
        }
      }
    }

    const pdfBytes = await pdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (error) {
    console.error('Error generating PDF document:', error);
    throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate PDF document');
  }
};

// Helper function to wrap text
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = font.widthOfTextAtSize(`${currentLine} ${word}`, fontSize);
    
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  
  lines.push(currentLine);
  return lines;
}

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
