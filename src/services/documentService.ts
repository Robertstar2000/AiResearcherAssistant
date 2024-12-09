import { ResearchSection } from '../store/slices/researchSlice';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { jsPDF } from 'jspdf';
import pdfMake from 'pdfmake/build/pdfmake';
import htmlToPdfmake from 'html-to-pdfmake';

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
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // Title page
  doc.setFontSize(24);
  const titleLines = doc.splitTextToSize(metadata.title, pageWidth - 40);
  const titleY = 60;
  titleLines.forEach((line: string, index: number) => {
    doc.text(line, pageWidth / 2, titleY + (index * 10), { align: 'center' });
  });
  
  doc.setFontSize(12);
  doc.text(`Author: ${metadata.author}`, pageWidth / 2, 120, { align: 'center' });
  doc.text(`Date: ${metadata.date}`, pageWidth / 2, 135, { align: 'center' });
  
  doc.addPage(); // Page break after title

  // Table of Contents
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Table of Contents', 20, 20);
  
  let yPos = 40;
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    doc.text(`${sectionNumber}. ${section.title}`, 20, yPos);
    yPos += 10;

    if (section.subsections?.length) {
      section.subsections.forEach((subsection, subIndex) => {
        const subsectionNumber = `${sectionNumber}.${subIndex + 1}`;
        doc.text(`    ${subsectionNumber}. ${subsection.title}`, 20, yPos);
        yPos += 10;
      });
    }
  });

  doc.addPage(); // Page break after TOC
  doc.addPage(); // Extra page break for spacing

  // Content
  let currentY = 20;
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    
    if (currentY > doc.internal.pageSize.height - 40) {
      doc.addPage();
      currentY = 20;
    }

    // Section header
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`${sectionNumber}. ${section.title}`, 20, currentY);
    currentY += 10;

    // Section content
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const contentLines = doc.splitTextToSize(section.content, pageWidth - 40);
    contentLines.forEach(line => {
      if (currentY > doc.internal.pageSize.height - 20) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(line, 20, currentY);
      currentY += 7;
    });
    currentY += 14; // Add 2 line feeds after section content

    if (section.subsections?.length) {
      section.subsections.forEach((subsection, subIndex) => {
        const subsectionNumber = `${sectionNumber}.${subIndex + 1}`;
        
        if (currentY > doc.internal.pageSize.height - 40) {
          doc.addPage();
          currentY = 20;
        }

        // Subsection header
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${subsectionNumber}. ${subsection.title}`, 25, currentY);
        currentY += 10;

        // Subsection content
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        const subContentLines = doc.splitTextToSize(subsection.content, pageWidth - 45);
        subContentLines.forEach(line => {
          if (currentY > doc.internal.pageSize.height - 20) {
            doc.addPage();
            currentY = 20;
          }
          doc.text(line, 25, currentY);
          currentY += 7;
        });
        currentY += 14; // Add 2 line feeds after subsection content
      });
    }
  });

  // References section
  if (references && references.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('References', 20, 20);
    
    // Add extra space before first citation
    currentY = 50; // Increased from 40 to 50 for more space
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    
    references.forEach((ref, index) => {
      // Check if we need a new page
      if (currentY > doc.internal.pageSize.height - 40) {
        doc.addPage();
        currentY = 20;
      }
      
      const refLines = doc.splitTextToSize(ref, pageWidth - 40);
      refLines.forEach((line: string) => {
        doc.text(line, 20, currentY);
        currentY += 7;
      });
      
      // Add two line feeds after each citation (increased space)
      currentY += 20; // Increased from 14 to 20 for more visible spacing
    });
  }

  return doc.output('blob');
};

export const generateDOCX = async (
  metadata: DocumentMetadata,
  sections: ResearchSection[],
  references: string[]
): Promise<Blob> => {
  const children = [
    // Title Page
    new Paragraph({
      text: metadata.title,
      heading: HeadingLevel.TITLE,
      spacing: {
        before: 3000,
        after: 3000
      },
      alignment: 'center'
    }),
    new Paragraph({
      text: `Author: ${metadata.author}`,
      spacing: { after: 300 },
      alignment: 'center'
    }),
    new Paragraph({
      text: `Date: ${metadata.date}`,
      spacing: { after: 500 },
      alignment: 'center'
    }),
    new Paragraph({
      text: '',
      pageBreakBefore: true
    }),

    // Table of Contents
    new Paragraph({
      text: 'Table of Contents',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 }
    }),
  ];

  // Add TOC entries
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    children.push(
      new Paragraph({
        text: `${sectionNumber}. ${section.title}`,
        spacing: { after: 200 }
      })
    );

    if (section.subsections?.length) {
      section.subsections.forEach((subsection, subIndex) => {
        const subsectionNumber = `${sectionNumber}.${subIndex + 1}`;
        children.push(
          new Paragraph({
            text: `    ${subsectionNumber}. ${subsection.title}`,
            spacing: { after: 200 }
          })
        );
      });
    }
  });

  // Page break after TOC
  children.push(
    new Paragraph({
      text: '',
      pageBreakBefore: true
    })
  );

  // Content sections
  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    children.push(
      new Paragraph({
        text: `${sectionNumber}. ${section.title}`,
        heading: HeadingLevel.HEADING_1,
        bold: true,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: section.content,
        size: 22, // Smaller font size for content
        spacing: { after: 300 }
      })
    );

    if (section.subsections?.length) {
      section.subsections.forEach((subsection, subIndex) => {
        const subsectionNumber = `${sectionNumber}.${subIndex + 1}`;
        children.push(
          new Paragraph({
            text: `${subsectionNumber}. ${subsection.title}`,
            heading: HeadingLevel.HEADING_2,
            bold: true,
            spacing: { before: 300, after: 200 }
          }),
          new Paragraph({
            text: subsection.content,
            size: 22, // Smaller font size for content
            spacing: { after: 300 }
          })
        );
      });
    }
  });

  // References section
  if (references && references.length > 0) {
    // Add page break before references
    children.push(
      new Paragraph({
        text: '',
        pageBreakBefore: true
      }),
      new Paragraph({
        text: 'References',
        heading: HeadingLevel.HEADING_1,
        bold: true,
        spacing: { before: 400, after: 400 } // Increased after spacing
      })
    );

    // Add extra paragraph for spacing before first citation
    children.push(
      new Paragraph({
        text: '',
        spacing: { before: 400, after: 400 }
      })
    );

    // Add each reference with extra spacing
    references.forEach((ref, index) => {
      children.push(
        new Paragraph({
          text: ref,
          size: 22, // Smaller font size for citations
          spacing: { before: 200, after: 400 } // Increased after spacing
        }),
        // Add extra paragraph for spacing between citations
        new Paragraph({
          text: '',
          spacing: { before: 200, after: 200 }
        })
      );
    });
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  return Packer.toBlob(doc);
};

export const downloadDocument = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
