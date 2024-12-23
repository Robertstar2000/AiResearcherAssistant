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

export const generateWordDocument = (sections: ResearchSection[], title: string): Document => {
  const children = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400,
        before: 400
      }
    }),
    new Paragraph({
      text: '',
      spacing: { before: 0, after: 0 },
      thematicBreak: true
    }),
    new Paragraph({
      text: "Table of Contents",
      heading: HeadingLevel.HEADING_1,
      spacing: {
        after: 300
      }
    })
  ];

  // Add TOC entries
  sections.forEach((section) => {
    children.push(
      new Paragraph({
        text: section.title,
        style: "TOC1"
      })
    );
    
    if (section.subsections) {
      section.subsections.forEach((subsection) => {
        children.push(
          new Paragraph({
            text: `    ${subsection.title}`,
            style: "TOC2"
          })
        );
      });
    }
  });

  // Add page break after TOC
  children.push(
    new Paragraph({
      text: '',
      spacing: { before: 0, after: 0 },
      thematicBreak: true
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
    sections: [{
      properties: {},
      children: children
    }],
  });
};

export const generatePdfDocument = async (
  metadata: { title: string },
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    // Create pages and add content
    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const normalSize = 12;
    const titleSize = 24;
    
    // Add title
    const titleWidth = boldFont.widthOfTextAtSize(metadata.title, titleSize);
    page.drawText(metadata.title, {
      x: (width - titleWidth) / 2,
      y: height - 150,
      font: boldFont,
      size: titleSize
    });

    // Add sections
    let yPosition = height - 200;
    for (const section of sections) {
      if (yPosition < 50) {
        page = pdfDoc.addPage();
        yPosition = height - 50;
      }

      // Add section title
      const sectionTitle = `${section.number}. ${section.title}`;
      page.drawText(sectionTitle, {
        x: 50,
        y: yPosition,
        font: boldFont,
        size: 16
      });

      yPosition -= 30;

      // Add section content
      if (section.content) {
        const lines = wrapText(section.content, font, normalSize, width - 100);
        for (const line of lines) {
          if (yPosition < 50) {
            page = pdfDoc.addPage();
            yPosition = height - 50;
          }

          page.drawText(line, {
            x: 50,
            y: yPosition,
            font: font,
            size: normalSize
          });

          yPosition -= 20;
        }
      }

      yPosition -= 20;
    }

    // Add references if any
    if (references.length > 0) {
      if (yPosition < 100) {
        page = pdfDoc.addPage();
        yPosition = height - 50;
      }

      page.drawText('References', {
        x: 50,
        y: yPosition,
        font: boldFont,
        size: 16
      });

      yPosition -= 30;

      for (const ref of references) {
        const lines = wrapText(ref, font, normalSize, width - 100);
        for (const line of lines) {
          if (yPosition < 50) {
            page = pdfDoc.addPage();
            yPosition = height - 50;
          }

          page.drawText(line, {
            x: 50,
            y: yPosition,
            font: font,
            size: normalSize
          });

          yPosition -= 20;
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
