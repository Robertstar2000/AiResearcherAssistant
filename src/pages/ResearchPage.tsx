import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  LinearProgress,
  TextField,
  Typography,
  Container,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  SelectChangeEvent,
} from '@mui/material';
import { RootState } from '../store/store';
import {
  setMode,
  setType,
  setSections,
  setError,
  setResearchTarget,
} from '../store/slices/researchSlice';
import { ResearchSection, ResearchMode, ResearchType } from '../types/research';
import { researchApi } from '../services/api';
import { generateResearchContent } from '../services/researchService';
import { Document, Packer, Paragraph, HeadingLevel, SectionType, TextRun } from 'docx';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

// Import pdfMake for browser environment
import pdfMake from 'pdfmake/build/pdfmake';
import 'pdfmake/build/vfs_fonts';

interface ProgressState {
  progress: number;
  message: string;
}

const ResearchPage = () => {
  const dispatch = useDispatch();
  const research = useSelector((state: RootState) => state.research);
  const [progressState, setProgressState] = useState<ProgressState>({ progress: 0, message: '' });
  const [researchGenerated, setResearchGenerated] = useState(false);
  const [targetGenerated, setTargetGenerated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const getDocumentTitle = () => {
    const titleMatch = research.researchTarget.match(/Title:\s*\*\*(.*?)\*\*/);
    if (titleMatch && titleMatch[1]) {
      const fullTitle = titleMatch[1];
      // Get first sentence
      const firstSentence = fullTitle.split(/[.!?]/)[0].trim();
      return firstSentence;
    }
    return 'Research Paper'; // Default title
  };

  const generateTableOfContents = () => {
    if (!research.sections) return '';
    
    let toc = 'Table of Contents\n\n';
    research.sections.forEach(section => {
      toc += `${section.number}. ${section.title}\n`;
      if (section.subsections) {
        section.subsections.forEach(sub => {
          toc += `    ${sub.number}. ${sub.title}\n`;
        });
      }
    });
    return toc;
  };

  const parseOutline = (content: string): ResearchSection[] => {
    const lines = content.split('\n').filter(line => line.trim());
    const sections: ResearchSection[] = [];
    let currentMainSection: ResearchSection | null = null;
    let currentSubSection: ResearchSection | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Match main sections (e.g., "1.", "2.", etc.)
      const mainSectionMatch = trimmedLine.match(/^(\d+\.)\s+(.+)/);
      
      // Match subsections (e.g., "1.1.", "2.1.", etc.)
      const subSectionMatch = trimmedLine.match(/^(\d+\.\d+\.?)\s+(.+)/);

      if (mainSectionMatch && !subSectionMatch) {
        // If we have a previous main section, save it
        if (currentMainSection) {
          sections.push(currentMainSection);
        }
        
        // Start new main section
        currentMainSection = {
          number: mainSectionMatch[1],
          title: mainSectionMatch[2],
          content: '',
          subsections: []
        };
        currentSubSection = null;
        
      } else if (subSectionMatch && currentMainSection) {
        // If we have a previous subsection, save it
        if (currentSubSection) {
          currentMainSection.subsections?.push(currentSubSection);
        }
        
        // Start new subsection
        currentSubSection = {
          number: subSectionMatch[1],
          title: subSectionMatch[2],
          content: ''
        };
        
      } else if (currentSubSection) {
        // Add description to current subsection
        currentSubSection.content = currentSubSection.content
          ? `${currentSubSection.content}\n${trimmedLine}`
          : trimmedLine;
          
      } else if (currentMainSection) {
        // Add description to current main section
        currentMainSection.content = currentMainSection.content
          ? `${currentMainSection.content}\n${trimmedLine}`
          : trimmedLine;
      }
    }

    // Save the last sections if they exist
    if (currentSubSection && currentMainSection) {
      currentMainSection.subsections?.push(currentSubSection);
    }
    if (currentMainSection) {
      sections.push(currentMainSection);
    }

    return sections;
  };

  const handleDocumentGeneration = async () => {
    try {
      setIsGenerating(true);
      dispatch(setError(undefined));
      setProgressState({
        progress: 0,
        message: 'Generating research content...',
      });

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

      const parsedSections = parseOutline(outline);
      dispatch(setSections(parsedSections));
      setProgressState({
        progress: 100,
        message: 'Outline generated successfully!',
      });
      setResearchGenerated(false);
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

  const handleDownloadWord = async () => {
    try {
      const title = getDocumentTitle();
      const toc = generateTableOfContents();

      dispatch(setError(undefined));
      setProgressState({
        progress: 0,
        message: 'Generating Word document...',
      });

      // Create document
      const doc = new Document({
        sections: [{
          properties: { type: SectionType.CONTINUOUS },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: title,
                  size: 32,
                  bold: true
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: toc
                })
              ]
            }),
            ...(research.sections?.flatMap(section => [
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [
                  new TextRun({
                    text: `${section.number}. ${section.title}`,
                    size: 28,
                    bold: true
                  })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: section.content || ''
                  })
                ]
              }),
              ...(section.subsections?.flatMap(sub => [
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  children: [
                    new TextRun({
                      text: `${sub.number}. ${sub.title}`,
                      size: 24,
                      bold: true
                    })
                  ]
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: sub.content || ''
                    })
                  ]
                })
              ]) || [])
            ]) || [])
          ]
        }]
      });

      // Convert to blob
      const blob = await Packer.toBlob(doc);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.substring(0, 30)}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setProgressState({
        progress: 100,
        message: 'Word document generated successfully!',
      });
    } catch (error) {
      console.error('Error downloading Word document:', error);
      dispatch(setError('Failed to download Word document'));
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const title = getDocumentTitle();
      const toc = generateTableOfContents();

      dispatch(setError(undefined));
      setProgressState({
        progress: 0,
        message: 'Generating PDF...',
      });

      const content: any[] = [
        { text: title, style: 'header' },
        { text: toc, style: 'toc' }
      ];

      // Add sections
      research.sections?.forEach(section => {
        content.push({ text: `${section.number}. ${section.title}`, style: 'section' });
        if (section.content) {
          content.push({ text: section.content, style: 'sectionContent' });
        }
        
        section.subsections?.forEach(sub => {
          content.push({ text: `${sub.number}. ${sub.title}`, style: 'subsection' });
          if (sub.content) {
            content.push({ text: sub.content, style: 'subsectionContent' });
          }
        });
      });

      const docDefinition: TDocumentDefinitions = {
        content,
        styles: {
          header: {
            fontSize: 24,
            bold: true,
            alignment: 'center'
          },
          toc: {
            fontSize: 18,
            bold: true,
            alignment: 'center'
          },
          section: {
            fontSize: 18,
            bold: true
          },
          sectionContent: {
            fontSize: 14
          },
          subsection: {
            fontSize: 16,
            bold: true
          },
          subsectionContent: {
            fontSize: 14
          }
        }
      };

      const pdfDoc = pdfMake.createPdf(docDefinition);
      pdfDoc.download(`${title.substring(0, 30)}.pdf`);

      setProgressState({
        progress: 100,
        message: 'PDF generated successfully!',
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      dispatch(setError('Failed to download PDF'));
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
            onChange={(e: SelectChangeEvent<ResearchMode>) => {
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
            onChange={(e: SelectChangeEvent<ResearchType>) => {
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
        value={research.researchTarget}
        onChange={(e) => {
          dispatch(setResearchTarget(e.target.value));
          setTargetGenerated(false);
          setResearchGenerated(false);
        }}
        placeholder="Enter your research target..."
        sx={{ mb: 2 }}
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
        1. Account Setup
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Click "Sign Up" to create new account
        • Provide email and secure password
        • Verify email if required
        • Use "Sign In" with your credentials
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        2. Research Settings
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Select Research Mode:
          - Basic: Shorter, simpler papers
          - Advanced: Detailed academic papers
          - Expert: Comprehensive research
        • Choose Research Type:
          - General: Standard research
          - Literature: Focus on existing research
          - Experimental: Scientific experiments
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        3. Research Process
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        a) Enter Research Topic
        • Input your research subject
        • Click "Generate Target" for refined focus
        
        b) Generate Outline
        • Wait for target generation
        • Click "Generate Outline" (blue when ready)
        • Review the generated outline
        
        c) Generate Content
        • Click "Generate Research" (blue when ready)
        • Wait for section-by-section generation
        • Each section takes time due to AI processing
        
        d) Export Options
        • Download as Word document
        • Download as PDF
        • All formatting included
      </Typography>

      <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold' }}>
        4. Tips
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        • Be patient during generation
        • Don't refresh during processing
        • Save work regularly
        • Check progress bar for status
        • Error messages will guide if issues occur
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
