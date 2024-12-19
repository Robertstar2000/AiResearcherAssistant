import { Document, Paragraph, Packer, HeadingLevel, AlignmentType, TableOfContents, PageBreak } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ResearchSection } from '../types';

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
  
  sections.forEach((section) => {
    if (section.title) {
      markdown += `${section.number}. ${section.title}\n\n`;
    }
    if (section.content) {
      markdown += `${section.content}\n\n`;
    }
    
    if (section.subsections && section.subsections.length > 0) {
      section.subsections.forEach((subsection) => {
        if (subsection.title) {
          markdown += `${section.number}.${subsection.number} ${subsection.title}\n\n`;
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
  const lines = markdown.split('\n').filter(line => line.trim());
  const paragraphs: Paragraph[] = [];
  let currentHeadingLevel = 0;

  lines.forEach(line => {
    const mainSectionMatch = line.match(/^(\d+)\.\s+(.+)/);
    const subSectionMatch = line.match(/^(\d+\.\d+)\s+(.+)/);
    
    if (mainSectionMatch) {
      currentHeadingLevel = 1;
      paragraphs.push(
        new Paragraph({
          text: mainSectionMatch[2],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        })
      );
    } else if (subSectionMatch) {
      currentHeadingLevel = 2;
      paragraphs.push(
        new Paragraph({
          text: subSectionMatch[2],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        })
      );
    } else if (line.trim()) {
      paragraphs.push(
        new Paragraph({
          text: line,
          spacing: { after: 200 },
          indent: currentHeadingLevel === 2 ? { left: 720 } : undefined // 0.5 inch indent for subsection content
        })
      );
    }
  });

  return paragraphs;
};

export const generateWordDocument = async (options: DocumentOptions): Promise<Blob> => {
  try {
    const markdown = convertToMarkdown(options.sections);
    const titlePage = [
      new Paragraph({
        text: options.title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
        alignment: AlignmentType.CENTER
      }),
      new Paragraph({
        text: `By ${options.author}`,
        spacing: { after: 800 },
        alignment: AlignmentType.CENTER
      }),
    ];
    const contentParagraphs = parseMarkdownToDocx(markdown);

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          ...titlePage,
          new PageBreak(),
          new TableOfContents("Table of Contents"),
          new PageBreak(),
          ...contentParagraphs
        ] as Paragraph[]
      }]
    });

    return await Packer.toBlob(doc);
  } catch (error) {
    console.error('Error generating Word document:', error);
    throw error;
  }
};

export const generatePdfDocument = async (
  metadata: DocumentMetadata,
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    // Title Page
    let page = pdfDoc.addPage();
    const { width } = page.getSize();
    const titleSize = 24;
    const normalSize = 12;
    
    // Center title
    const titleWidth = boldFont.widthOfTextAtSize(metadata.title, titleSize);
    page.drawText(metadata.title, {
      x: (width - titleWidth) / 2,
      y: 600,
      font: boldFont,
      size: titleSize
    });

    // Add author
    const authorText = `By ${metadata.author}`;
    const authorWidth = font.widthOfTextAtSize(authorText, normalSize);
    page.drawText(authorText, {
      x: (width - authorWidth) / 2,
      y: 550,
      font: font,
      size: normalSize
    });

    // Table of Contents
    page = pdfDoc.addPage();
    let yPosition = 600;
    
    page.drawText('Table of Contents', {
      x: 50,
      y: yPosition,
      font: boldFont,
      size: 16
    });

    yPosition -= 40;
    let pageNumber = 3; // Start content on page 3

    // Add TOC entries
    for (const section of sections) {
      if (yPosition < 50) {
        page = pdfDoc.addPage();
        yPosition = 600;
      }

      const tocEntry = `${section.number}. ${section.title}`;
      page.drawText(tocEntry, {
        x: 50,
        y: yPosition,
        font: font,
        size: normalSize
      });
      
      page.drawText(pageNumber.toString(), {
        x: width - 50,
        y: yPosition,
        font: font,
        size: normalSize
      });

      yPosition -= 20;
      pageNumber += 2; // Estimate 2 pages per section
    }

    // Content Pages
    for (const section of sections) {
      page = pdfDoc.addPage();
      yPosition = 600;

      // Section title
      page.drawText(`${section.number}. ${section.title}`, {
        x: 50,
        y: yPosition,
        font: boldFont,
        size: 16
      });

      yPosition -= 30;

      // Section content
      const contentLines = wrapText(section.content, font, normalSize, width - 100);
      for (const line of contentLines) {
        if (yPosition < 50) {
          page = pdfDoc.addPage();
          yPosition = 600;
        }

        page.drawText(line, {
          x: 50,
          y: yPosition,
          font: font,
          size: normalSize
        });

        yPosition -= 20;
      }

      // Subsections
      if (section.subsections) {
        for (const subsection of section.subsections) {
          if (yPosition < 50) {
            page = pdfDoc.addPage();
            yPosition = 600;
          }

          page.drawText(`${section.number}.${subsection.number} ${subsection.title}`, {
            x: 70,
            y: yPosition,
            font: boldFont,
            size: 14
          });

          yPosition -= 30;

          const subContentLines = wrapText(subsection.content, font, normalSize, width - 120);
          for (const line of subContentLines) {
            if (yPosition < 50) {
              page = pdfDoc.addPage();
              yPosition = 600;
            }

            page.drawText(line, {
              x: 70,
              y: yPosition,
              font: font,
              size: normalSize
            });

            yPosition -= 20;
          }
        }
      }
    }

    // References
    page = pdfDoc.addPage();
    yPosition = 600;

    page.drawText('References', {
      x: 50,
      y: yPosition,
      font: boldFont,
      size: 16
    });

    yPosition -= 40;

    for (const ref of references) {
      if (yPosition < 50) {
        page = pdfDoc.addPage();
        yPosition = 600;
      }

      const refLines = wrapText(ref, font, normalSize, width - 100);
      for (const line of refLines) {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          font: font,
          size: normalSize
        });

        yPosition -= 20;
      }
    }

    // Add page numbers
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      const { width } = page.getSize();
      
      if (i > 0) { // Skip page number on title page
        page.drawText(`${i + 1}`, {
          x: width / 2,
          y: 30,
          font: font,
          size: normalSize
        });
      }
    }

    return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
  } catch (error) {
    console.error('Error generating PDF document:', error);
    throw error;
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
