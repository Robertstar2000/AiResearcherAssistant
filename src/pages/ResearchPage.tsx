import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  LinearProgress,
  Typography,
  Container,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  SelectChangeEvent,
} from '@mui/material';
import { Document, Paragraph, Packer, HeadingLevel, AlignmentType, TextRun } from 'docx';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { saveAs } from 'file-saver';
import { ResearchSection } from '../types/research';
import type { ResearchMode, ResearchType } from '../types/research';
import { RootState } from '../store/store';
import { setError } from '../store/slices/researchSlice';
import { 
  setMode,
  setType,
  setSections,
  setResearchTarget,
} from '../store/slices/researchSlice';
import { researchApi } from '../services/api';
import { generateResearchContent } from '../services/researchService';
import { convertToMarkdown, parseMarkdownToDocx } from '../services/documentService';

// Initialize pdfMake with fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs;
(pdfMake as any).fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};

interface ProgressState {
  progress: number;
  message: string;
}

export const ResearchPage: React.FC = () => {
  const dispatch = useDispatch();
  const research = useSelector((state: RootState) => state.research);
  const [progressState, setProgressState] = useState<ProgressState>({
    progress: 0,
    message: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetGenerated, setTargetGenerated] = useState(false);
  const [researchGenerated, setResearchGenerated] = useState(false);

  const extractDocumentTitle = (target: string): string => {
    // Skip everything until after the second **
    const afterSecondMarker = target.split('**').slice(2).join('**').trim();
    // Get the first complete sentence
    const match = afterSecondMarker.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : afterSecondMarker;
  };

  const parseMarkdownToPdfContent = (text: string) => {
    const parts: Array<{ text: string; bold?: boolean; italic?: boolean; style?: string }> = [];
    let currentText = '';
    let i = 0;

    while (i < text.length) {
      if (text[i] === '*' || text[i] === '_' || text[i] === '#') {
        if (currentText) {
          parts.push({ text: currentText });
          currentText = '';
        }

        // Headers
        if (text[i] === '#') {
          const headerMatch = text.slice(i).match(/^(#{1,6})\s+([^\n]+)/);
          if (headerMatch) {
            const level = headerMatch[1].length;
            const headerText = headerMatch[2].trim();
            parts.push({ 
              text: headerText,
              style: `header${level}`,
              bold: true
            });
            i += headerMatch[0].length;
            continue;
          }
        }

        // Bold
        if (text.slice(i, i + 2) === '**' || text.slice(i, i + 2) === '__') {
          const endIndex = text.indexOf(text.slice(i, i + 2), i + 2);
          if (endIndex !== -1) {
            parts.push({ 
              text: text.slice(i + 2, endIndex),
              bold: true
            });
            i = endIndex + 2;
            continue;
          }
        }

        // Italic
        if (text[i] === '*' || text[i] === '_') {
          const endIndex = text.indexOf(text[i], i + 1);
          if (endIndex !== -1) {
            parts.push({ 
              text: text.slice(i + 1, endIndex),
              italic: true
            });
            i = endIndex + 1;
            continue;
          }
        }
      }

      currentText += text[i];
      i++;
    }

    if (currentText) {
      parts.push({ text: currentText });
    }

    return parts;
  };

  const parseMarkdownToWordContent = (text: string): Paragraph[] => {
    const paragraphs: Paragraph[] = [];
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2].trim();
        paragraphs.push(
          new Paragraph({
            text: headerText,
            heading: level === 1 ? HeadingLevel.HEADING_1 : 
                    level === 2 ? HeadingLevel.HEADING_2 :
                    level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4,
            spacing: { before: 200, after: 100 }
          })
        );
        continue;
      }

      // Regular paragraph with inline formatting
      const textRuns: TextRun[] = [];
      let currentText = '';
      let j = 0;

      while (j < line.length) {
        if (line[j] === '*' || line[j] === '_') {
          if (currentText) {
            textRuns.push(new TextRun({ text: currentText }));
            currentText = '';
          }

          // Bold
          if (line.slice(j, j + 2) === '**' || line.slice(j, j + 2) === '__') {
            const endIndex = line.indexOf(line.slice(j, j + 2), j + 2);
            if (endIndex !== -1) {
              textRuns.push(
                new TextRun({
                  text: line.slice(j + 2, endIndex),
                  bold: true
                })
              );
              j = endIndex + 2;
              continue;
            }
          }

          // Italic
          const endIndex = line.indexOf(line[j], j + 1);
          if (endIndex !== -1) {
            textRuns.push(
              new TextRun({
                text: line.slice(j + 1, endIndex),
                italics: true
              })
            );
            j = endIndex + 1;
            continue;
          }
        }

        currentText += line[j];
        j++;
      }

      if (currentText) {
        textRuns.push(new TextRun({ text: currentText }));
      }

      paragraphs.push(
        new Paragraph({
          children: textRuns,
          spacing: { before: 100, after: 100 }
        })
      );
    }

    return paragraphs;
  };

  const handleDocumentGeneration = async () => {
    if (!research.researchTarget) {
      dispatch(setError('Please enter a research target'));
      return;
    }

    setIsGenerating(true);
    setProgressState({
      progress: 0,
      message: 'Starting research generation...',
    });

    try {
      const outline = await researchApi.generateOutline(
        research.researchTarget,
        research.mode,
        research.type
      );

      console.log('Raw outline:', outline);

      const parsedSections: ResearchSection[] = outline
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string): ResearchSection => {
          const trimmedLine = line.trim()
            .replace(/^\*\*/, '') // Remove starting **
            .replace(/\*\*$/, '') // Remove ending **
            .replace(/^0\s+/, ''); // Remove leading "0 "
          
          console.log('Processing line:', trimmedLine);
          
          const mainSectionMatch = trimmedLine.match(/^(\d+)\.\s+(.+)/);
          const subSectionMatch = trimmedLine.match(/^(\d+\.\d+)\s+(.+)/);
          
          if (mainSectionMatch) {
            console.log('Main section match:', mainSectionMatch[1], mainSectionMatch[2]);
            return {
              number: mainSectionMatch[1] + '.',
              title: mainSectionMatch[2].replace(/^\*\*|\*\*$/g, '').trim(),
              content: '',
              subsections: []
            };
          } else if (subSectionMatch) {
            console.log('Sub section match:', subSectionMatch[1], subSectionMatch[2]);
            return {
              number: subSectionMatch[1],
              title: subSectionMatch[2].trim(),
              content: '',
              subsections: []
            };
          } else {
            console.log('Content line:', trimmedLine);
            return {
              number: '',
              title: trimmedLine,
              content: trimmedLine,
              subsections: []
            };
          }
        })
        .reduce((acc: ResearchSection[], curr: ResearchSection) => {
          if (curr.number) {
            if (curr.number.includes('.') && curr.number.split('.').length > 2) {
              // This is a subsection (e.g., 1.1)
              if (acc.length > 0) {
                const lastSection = acc[acc.length - 1];
                lastSection.subsections = lastSection.subsections || [];
                lastSection.subsections.push(curr);
              }
            } else {
              // This is a main section (e.g., 1.)
              acc.push(curr);
            }
          } else if (acc.length > 0) {
            // This is content for the previous section or subsection
            const lastSection = acc[acc.length - 1];
            if (lastSection.subsections && lastSection.subsections.length > 0) {
              // Add to the last subsection
              const lastSubsection = lastSection.subsections[lastSection.subsections.length - 1];
              lastSubsection.content = curr.title;
            } else {
              // Add to the main section
              lastSection.content = curr.title;
            }
          }
          return acc;
        }, []);

      console.log('Final parsed sections:', parsedSections);

      if (parsedSections.length > 0) {
        dispatch(setSections(parsedSections));
        setProgressState({
          progress: 100,
          message: 'Research outline generated successfully!',
        });
        setTargetGenerated(true);
      } else {
        throw new Error('No sections were parsed from the outline');
      }

      if (!research.sections) {
        throw new Error('No outline sections found');
      }

      const totalSections = research.sections.length;
      let completedSections = 0;

      const updatedSections = [...research.sections];
      
      // Process each section sequentially
      for (let i = 0; i < updatedSections.length; i++) {
        const section = updatedSections[i];
        setProgressState({
          progress: (completedSections / totalSections) * 100,
          message: `Generating content for section ${section.number}: ${section.title}...`,
        });

        // Generate content for main section
        const sectionResult = await generateResearchContent(
          [section],
          research.researchTarget,
          research.mode,
          research.type
        );
        
        if (sectionResult && sectionResult.length > 0) {
          updatedSections[i] = { ...sectionResult[0] };
        }

        // Process subsections if they exist
        if (section.subsections && section.subsections.length > 0) {
          const subsections = [...section.subsections];
          for (let j = 0; j < subsections.length; j++) {
            const subsection = subsections[j];
            setProgressState({
              progress: ((completedSections + (j + 1) / subsections.length) / totalSections) * 100,
              message: `Processing Research please standby`,
            });

            const subsectionResult = await generateResearchContent(
              [subsection],
              research.researchTarget,
              research.mode,
              research.type
            );
            
            if (subsectionResult && subsectionResult.length > 0) {
              subsections[j] = { ...subsectionResult[0] };
            }
          }
          updatedSections[i].subsections = subsections;
        }

        completedSections++;
        // Update the state after each section is complete to show progress
        dispatch(setSections([...updatedSections]));
      }

      setResearchGenerated(true);
      setProgressState({
        progress: 100,
        message: 'Research content generated successfully!',
      });
    } catch (error) {
      console.error('Error generating research:', error);
      dispatch(setError('Failed to generate research content'));
      setResearchGenerated(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateOutline = async () => {
    try {
      setIsGenerating(true);
      dispatch(setError(undefined));
      setProgressState({
        progress: 0,
        message: 'Generating outline...',
      });

      const outline = await researchApi.generateOutline(
        research.researchTarget,
        research.mode,
        research.type
      );

      console.log('Raw outline:', outline);

      const parsedSections: ResearchSection[] = outline
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string): ResearchSection => {
          const trimmedLine = line.trim()
            .replace(/^\*\*/, '') // Remove starting **
            .replace(/\*\*$/, '') // Remove ending **
            .replace(/^0\s+/, ''); // Remove leading "0 "
          
          console.log('Processing line:', trimmedLine);
          
          const mainSectionMatch = trimmedLine.match(/^(\d+)\.\s+(.+)/);
          const subSectionMatch = trimmedLine.match(/^(\d+\.\d+)\s+(.+)/);
          
          if (mainSectionMatch) {
            console.log('Main section match:', mainSectionMatch[1], mainSectionMatch[2]);
            return {
              number: mainSectionMatch[1] + '.',
              title: mainSectionMatch[2].replace(/^\*\*|\*\*$/g, '').trim(),
              content: '',
              subsections: []
            };
          } else if (subSectionMatch) {
            console.log('Sub section match:', subSectionMatch[1], subSectionMatch[2]);
            return {
              number: subSectionMatch[1],
              title: subSectionMatch[2].trim(),
              content: '',
              subsections: []
            };
          } else {
            console.log('Content line:', trimmedLine);
            return {
              number: '',
              title: trimmedLine,
              content: trimmedLine,
              subsections: []
            };
          }
        })
        .reduce((acc: ResearchSection[], curr: ResearchSection) => {
          if (curr.number) {
            if (curr.number.includes('.') && curr.number.split('.').length > 2) {
              // This is a subsection (e.g., 1.1)
              if (acc.length > 0) {
                const lastSection = acc[acc.length - 1];
                lastSection.subsections = lastSection.subsections || [];
                lastSection.subsections.push(curr);
              }
            } else {
              // This is a main section (e.g., 1.)
              acc.push(curr);
            }
          } else if (acc.length > 0) {
            // This is content for the previous section or subsection
            const lastSection = acc[acc.length - 1];
            if (lastSection.subsections && lastSection.subsections.length > 0) {
              // Add to the last subsection
              const lastSubsection = lastSection.subsections[lastSection.subsections.length - 1];
              lastSubsection.content = curr.title;
            } else {
              // Add to the main section
              lastSection.content = curr.title;
            }
          }
          return acc;
        }, []);

      console.log('Final parsed sections:', parsedSections);

      if (parsedSections.length > 0) {
        dispatch(setSections(parsedSections));
        setProgressState({
          progress: 100,
          message: 'Outline generated successfully!',
        });
        setResearchGenerated(false);
      } else {
        throw new Error('No sections were parsed from the outline');
      }
    } catch (error) {
      console.error('Error generating outline:', error);
      dispatch(setError('Failed to generate outline'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateTarget = async () => {
    try {
      setIsGenerating(true);
      dispatch(setError(undefined));
      setProgressState({
        progress: 0,
        message: 'Generating research target...',
      });

      const target = await researchApi.generateTarget(
        research.researchTarget,
        research.mode,
        research.type
      );

      dispatch(setResearchTarget(target));
      setProgressState({
        progress: 100,
        message: 'Research target generated successfully!',
      });
      setTargetGenerated(true);
      setResearchGenerated(false);
    } catch (error) {
      console.error('Error generating target:', error);
      dispatch(setError('Failed to generate research target'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      if (!research.sections || research.sections.length === 0) {
        dispatch(setError('No content available to generate PDF'));
        return;
      }

      const documentTitle = extractDocumentTitle(research.researchTarget || '');
      const docDefinition: TDocumentDefinitions = {
        content: [
          {
            text: documentTitle,
            style: 'title'
          },
          {
            text: 'AI Research Assistant',
            style: 'author'
          },
          {
            text: 'MIFECO company mifecoinc@gmail.com',
            style: 'author'
          },
          {
            text: '',
            pageBreak: 'before'
          },
          ...research.sections.map(section => [
            {
              text: section.title,
              style: 'sectionHeader'
            },
            ...parseMarkdownToPdfContent(section.content || ''),
            ...(section.subsections?.map(sub => [
              {
                text: sub.title,
                style: 'subsectionHeader'
              },
              ...parseMarkdownToPdfContent(sub.content || '')
            ]).flat() || [])
          ]).flat()
        ],
        styles: {
          title: {
            fontSize: 24,
            bold: true,
            alignment: 'center',
            margin: [0, 100, 0, 20]
          },
          author: {
            fontSize: 14,
            alignment: 'center',
            margin: [0, 0, 0, 10]
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
          header1: {
            fontSize: 20,
            bold: true,
            margin: [0, 20, 0, 10]
          },
          header2: {
            fontSize: 18,
            bold: true,
            margin: [0, 15, 0, 10]
          },
          header3: {
            fontSize: 16,
            bold: true,
            margin: [0, 10, 0, 10]
          },
          content: {
            fontSize: 12,
            margin: [0, 0, 0, 10],
            lineHeight: 1.5
          }
        },
        defaultStyle: {
          font: 'Roboto',
          fontSize: 12,
          lineHeight: 1.5
        }
      };

      const pdfDoc = pdfMake.createPdf(docDefinition);
      pdfDoc.getBlob((blob: Blob) => {
        saveAs(blob, 'research.pdf');
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      dispatch(setError('Failed to generate PDF'));
    }
  };

  const handleDownloadWord = async () => {
    try {
      if (!research.sections || research.sections.length === 0) {
        dispatch(setError('No content available to generate Word document'));
        return;
      }

      const documentTitle = extractDocumentTitle(research.researchTarget || '');
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            // Title Page
            new Paragraph({
              text: documentTitle,
              heading: HeadingLevel.TITLE,
              spacing: { before: 400, after: 200 },
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              text: 'AI Research Assistant',
              spacing: { before: 200, after: 100 },
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              text: 'MIFECO company mifecoinc@gmail.com',
              spacing: { before: 100, after: 400 },
              alignment: AlignmentType.CENTER
            }),
            // Content (new page)
            new Paragraph({
              text: '',
              pageBreakBefore: true
            }),
            ...research.sections.flatMap(section => {
              if (!section.content && (!section.subsections || section.subsections.length === 0)) {
                return [];
              }

              const sectionContent = [];
              if (section.content) {
                sectionContent.push(
                  new Paragraph({
                    text: section.title,
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 }
                  }),
                  ...parseMarkdownToWordContent(section.content)
                );
              }

              if (section.subsections) {
                const subsectionsWithContent = section.subsections.filter(sub => sub.content);
                if (subsectionsWithContent.length > 0) {
                  sectionContent.push(
                    ...subsectionsWithContent.flatMap(sub => [
                      new Paragraph({
                        text: sub.title,
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 300, after: 200 }
                      }),
                      ...parseMarkdownToWordContent(sub.content || '')
                    ])
                  );
                }
              }

              return sectionContent;
            })
          ]
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, 'research.docx');
    } catch (error) {
      console.error('Error generating Word document:', error);
      dispatch(setError('Failed to generate Word document'));
    }
  };

  const handleExportMarkdown = () => {
    try {
      if (!research.sections || research.sections.length === 0) {
        dispatch(setError('No content available to export'));
        return;
      }

      const markdownContent = convertToMarkdown(research.sections);
      const blob = new Blob([markdownContent], { type: 'text/markdown; charset=utf-8' });
      saveAs(blob, 'research.md');
    } catch (error) {
      console.error('Error exporting markdown:', error);
      dispatch(setError('Failed to export markdown file'));
    }
  };

  const handleImportMarkdown = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) {
        dispatch(setError('No file selected'));
        return;
      }

      const text = await file.text();
      const sections = parseMarkdownToDocx(text);

      if (!sections || sections.length === 0) {
        throw new Error('Failed to parse markdown content');
      }

      const formattedSections = sections.map((section: ResearchSection) => ({
        ...section,
        content: section.content || '',
        subsections: section.subsections?.map((sub: ResearchSection) => ({
          ...sub,
          content: sub.content || ''
        })) || []
      }));

      dispatch(setSections(formattedSections));
      setProgressState({
        progress: 100,
        message: 'Markdown imported successfully!',
      });
      setResearchGenerated(false);
    } catch (error) {
      console.error('Error importing markdown:', error);
      dispatch(setError('Failed to import markdown'));
    }
  };

  const renderOutline = () => {
    if (!research.sections || research.sections.length === 0) return null;

    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Research Outline
        </Typography>
        {research.sections.map((section) => (
          <Box key={section.number} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', ml: 2 }}>
              {section.number} {section.title}
            </Typography>
            {section.content && (
              <Typography variant="body1" sx={{ ml: 4, mt: 1 }}>
                {section.content}
              </Typography>
            )}
            {section.subsections?.map((sub) => (
              <Box key={sub.number} sx={{ ml: 4, mt: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  {sub.number} {sub.title}
                </Typography>
                {sub.content && (
                  <Typography variant="body2" sx={{ ml: 2, mt: 0.5 }}>
                    {sub.content}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    );
  };

  const renderResearch = () => {
    if (!research.sections || research.sections.length === 0) return null;

    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Generated Research Content
        </Typography>
        {research.sections.map((section) => (
          <Box key={section.number} sx={{ mb: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              {section.number} {section.title}
            </Typography>
            {section.content && (
              <Typography variant="body1" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                {section.content}
              </Typography>
            )}
            {section.subsections?.map((sub) => (
              <Box key={sub.number} sx={{ mt: 3, ml: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {sub.number} {sub.title}
                </Typography>
                {sub.content && (
                  <Typography variant="body1" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                    {sub.content}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    );
  };

  const renderSettingsStep = () => {
    return (
      <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
        <FormControl fullWidth>
          <InputLabel id="mode-label">Mode</InputLabel>
          <Select
            labelId="mode-label"
            id="mode-select"
            value={research.mode}
            label="Mode"
            onChange={(e: SelectChangeEvent) => {
              dispatch(setMode(e.target.value as ResearchMode));
            }}
          >
            <MenuItem value="basic">Basic</MenuItem>
            <MenuItem value="advanced">Advanced</MenuItem>
            <MenuItem value="expert">Expert</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel id="type-label">Type</InputLabel>
          <Select
            labelId="type-label"
            id="type-select"
            value={research.type}
            label="Type"
            onChange={(e: SelectChangeEvent) => {
              dispatch(setType(e.target.value as ResearchType));
            }}
          >
            <MenuItem value="general">General</MenuItem>
            <MenuItem value="literature">Literature Review</MenuItem>
            <MenuItem value="experiment">Experimental</MenuItem>
          </Select>
        </FormControl>
      </Box>
    );
  };

  const renderTargetStep = () => (
    <>
      <Typography variant="h6" gutterBottom>
        Research Target
      </Typography>
      <TextField
        fullWidth
        multiline
        rows={4}
        variant="outlined"
        label="Research Target"
        value={research.researchTarget}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
          dispatch(setResearchTarget(e.target.value));
          setTargetGenerated(false);
          setResearchGenerated(false);
        }}
      />
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          onClick={handleGenerateTarget}
          disabled={!research.researchTarget || isGenerating}
        >
          Generate Target
        </Button>
        <Button
          variant="contained"
          onClick={handleGenerateOutline}
          disabled={!targetGenerated || isGenerating}
          sx={{
            backgroundColor: targetGenerated ? 'primary.main' : 'grey.500',
            '&:hover': {
              backgroundColor: targetGenerated ? 'primary.dark' : 'grey.600',
            },
          }}
        >
          Generate Outline
        </Button>
        <Button
          variant="contained"
          onClick={handleDocumentGeneration}
          disabled={!research.sections || research.sections.length === 0 || isGenerating}
          sx={{
            backgroundColor: (research.sections && research.sections.length > 0) ? 'primary.main' : 'grey.500',
            '&:hover': {
              backgroundColor: (research.sections && research.sections.length > 0) ? 'primary.dark' : 'grey.600',
            },
          }}
        >
          Generate Research
        </Button>
        <Button
          variant="contained"
          onClick={handleDownloadWord}
          disabled={!researchGenerated || isGenerating}
          sx={{
            backgroundColor: researchGenerated ? 'primary.main' : 'grey.500',
            '&:hover': {
              backgroundColor: researchGenerated ? 'primary.dark' : 'grey.600',
            },
          }}
        >
          Download Word
        </Button>
        <Button
          variant="contained"
          onClick={handleDownloadPdf}
          disabled={!researchGenerated || isGenerating}
          sx={{
            backgroundColor: researchGenerated ? 'primary.main' : 'grey.500',
            '&:hover': {
              backgroundColor: researchGenerated ? 'primary.dark' : 'grey.600',
            },
          }}
        >
          Download PDF
        </Button>
        <Button
          variant="contained"
          onClick={handleExportMarkdown}
          disabled={!researchGenerated || isGenerating}
          sx={{
            backgroundColor: researchGenerated ? 'primary.main' : 'grey.500',
            '&:hover': {
              backgroundColor: researchGenerated ? 'primary.dark' : 'grey.600',
            },
          }}
        >
          Export Markdown
        </Button>
        <input
          type="file"
          accept=".md"
          onChange={handleImportMarkdown}
          style={{ display: 'none' }}
          id="markdown-import"
        />
        <label htmlFor="markdown-import">
          <Button
            variant="contained"
            onClick={() => document.getElementById('markdown-import')?.click()}
          >
            Import Markdown
          </Button>
        </label>
      </Box>
    </>
  );

  const renderHelpText = () => (
    <Box sx={{ p: 3, maxWidth: 300 }}>
      <Typography variant="h5" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
        AI Research Assistant
      </Typography>

      <Typography variant="subtitle1" color="error" sx={{ mb: 2, fontWeight: 'bold' }}>
        ⚠️ Please Note: Research generation may take a long time due to multiple AI completions required for comprehensive content.
      </Typography>

      <Typography variant="h6" gutterBottom sx={{ mt: 3, color: 'primary.main' }}>
        Getting Started
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        1. Account Setup & Security
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Creating an Account:
          - Click "Sign Up" in the top navigation
          - Enter your email address (used for account recovery)
          - Create a strong password (min. 8 characters)
          - Verify your email through the confirmation link
        
        • Logging In:
          - Use "Sign In" with your registered email
          - Enter your password
          - Enable "Remember Me" for convenience
          - Use "Forgot Password" if needed
        
        • Account Security:
          - Keep your credentials secure
          - Change password periodically
          - Log out when using shared devices
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        2. Research Settings Configuration
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Research Mode (Determines Depth & Length):
          - Basic Mode (5-7 pages):
            * Quick overview of topics
            * Key points and main arguments
            * Suitable for brief reports
            * Faster generation time
          
          - Advanced Mode (10-15 pages):
            * Detailed analysis of topics
            * Supporting evidence and examples
            * Citations and references
            * Balanced for most academic needs
          
          - Expert Mode (20+ pages):
            * Comprehensive coverage
            * In-depth analysis
            * Extensive references
            * Suitable for thesis/dissertation
        
        • Research Type (Determines Approach):
          - General Research:
            * Balanced mix of analysis
            * Covers multiple perspectives
            * Includes background information
            * Best for most topics
          
          - Literature Review:
            * Focus on existing research
            * Analysis of current literature
            * Comparison of different studies
            * Best for academic reviews
          
          - Experimental Research:
            * Methodology-focused
            * Data analysis emphasis
            * Results and discussion
            * Best for scientific studies
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        3. Research Target Refinement
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Initial Setup:
          - Enter your broad research topic
          - Be specific but not too narrow
          - Include key aspects you want to cover
        
        • Using Generate Target:
          - AI analyzes your input
          - Suggests focused research direction
          - Adds relevant subtopics
          - Structures the research scope
        
        • Fine-tuning the Target:
          - Edit the generated target text
          - Add specific areas of interest
          - Remove unwanted aspects
          - Adjust scope and direction
          - Each edit influences final content
          - Can regenerate target if needed
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        4. Research Generation Process
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Step 1: Generate Target
          - Refines your research focus
          - Creates structured approach
          - Identifies key areas
          - Wait for completion (blue button)
        
        • Step 2: Generate Outline
          - Creates detailed structure
          - Organizes main sections
          - Adds relevant subsections
          - Shows research flow
          - Review before proceeding
        
        • Step 3: Generate Research
          - Processes section by section
          - Creates detailed content
          - Adds citations and references
          - Maintains academic style
          - Progress bar shows status
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        5. Document Management
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Export Options:
          - Word (.docx):
            * Professional formatting
            * Easy to edit
            * Compatible with Office
          
          - PDF:
            * Print-ready format
            * Consistent layout
            * Best for sharing
          
          - Markdown (.md):
            * Plain text with formatting
            * Version control friendly
            * Easy to edit in any editor
        
        • Working with Markdown:
          - Export Markdown:
            * Saves all content and structure
            * Preserves formatting
            * Lightweight file format
            * Easy to share and backup
          
          - Import Markdown:
            * Load previous research
            * Continue work later
            * Merge multiple documents
            * Share with collaborators
            * Edit in external editors
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        6. Best Practices & Tips
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • During Generation:
          - Be patient with AI processing
          - Watch progress bar for status
          - Don't refresh the page
          - Save work regularly
        
        • Workflow Tips:
          - Export to Markdown frequently
          - Review each step's output
          - Fine-tune target if needed
          - Use appropriate mode for needs
        
        • Troubleshooting:
          - Check error messages
          - Retry if generation fails
          - Contact support if needed
          - Use Import/Export for backup
      </Typography>
    </Box>
  );

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', gap: 4, mt: 4 }}>
        <Box sx={{ 
          width: 300, 
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          height: '100vh',
          overflowY: 'auto'
        }}>
          {renderHelpText()}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ my: 4 }}>
            <Typography variant="h4" gutterBottom>
              AI Research Assistant
            </Typography>

            {renderSettingsStep()}

            {research.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {research.error}
              </Alert>
            )}

            <Box sx={{ mt: 4 }}>
              {renderTargetStep()}
              
              {isGenerating && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress variant="determinate" value={progressState.progress} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {progressState.message}
                  </Typography>
                </Box>
              )}

              {research.sections && research.sections.length > 0 && renderOutline()}
              {researchGenerated && renderResearch()}
            </Box>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}

export default ResearchPage;
