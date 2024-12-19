import {
  Container,
  Typography,
  Paper,
  Grid,
  Alert,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Box,
  LinearProgress,
  SelectChangeEvent,
  FormControl,
  Theme,
} from '@mui/material';
import {
  setSections,
  setError,
  setMode,
  setType,
  ResearchMode,
  ResearchType,
  ResearchSection,
  setResearchTarget,
} from '../store/slices/researchSlice';
import { researchApi } from '../services/api';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

interface ProgressState {
  progress: number;
  message: string;
}

const parseOutline = (outline: string): ResearchSection[] => {
  const lines = outline.split('\n').filter((line) => line.trim());
  const sections: ResearchSection[] = [];
  let currentSection: ResearchSection | null = null;

  for (const line of lines) {
    const match = line.match(/^(\d+\.?(?:\d+)?)\s*(.*)/);
    if (match) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        number: match[1],
        title: match[2].trim(),
        content: '',
        subsections: [],
      };
    } else if (currentSection) {
      currentSection.content += (currentSection.content ? '\n' : '') + line.trim();
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
};

export default function ResearchPage() {
  const dispatch = useDispatch();
  const research = useSelector((state: RootState) => state.research);
  const [progressState, setProgressState] = useState<ProgressState>({
    progress: 0,
    message: '',
  });
  const [parsedOutline, setParsedOutline] = useState<ResearchSection[]>([]);
  const [query, setQuery] = useState('');
  const [minSections, setMinSections] = useState<number | null>(null);
  const [maxSections, setMaxSections] = useState<number | null>(null);
  const [targetGenerated, setTargetGenerated] = useState(false);
  const [sectionsGenerated, setSectionsGenerated] = useState(false);
  const [outlineCreated, setOutlineCreated] = useState(false);
  const [researchGenerated, setResearchGenerated] = useState(false);

  const renderSettings = () => (
    <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Research Settings
      </Typography>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Mode</InputLabel>
        <Select value={research.mode} label="Mode" onChange={handleModeChange}>
          <MenuItem value={ResearchMode.Basic}>Basic</MenuItem>
          <MenuItem value={ResearchMode.Advanced}>Advanced</MenuItem>
          <MenuItem value={ResearchMode.Article}>Article</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select value={research.type} label="Type" onChange={handleTypeChange}>
          <MenuItem value={ResearchType.General}>General Research</MenuItem>
          <MenuItem value={ResearchType.Literature}>Literature Review</MenuItem>
          <MenuItem value={ResearchType.Experiment}>Experimental Research</MenuItem>
        </Select>
      </FormControl>
    </Paper>
  );

  const renderDownloadButtons = () => (
    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
      <Button
        variant="contained"
        color="primary"
        onClick={handleDownloadWord}
        disabled={!researchGenerated}
        sx={{
          backgroundColor: !researchGenerated ? 'grey.500' : 'primary.main',
          '&:hover': {
            backgroundColor: !researchGenerated ? 'grey.500' : 'primary.dark',
          },
        }}
      >
        Download Word
      </Button>
      <Button
        variant="contained"
        color="primary"
        onClick={handleDownloadPdf}
        disabled={!researchGenerated}
        sx={{
           backgroundColor: !researchGenerated ? 'grey.500' : 'primary.main',
          '&:hover': {
            backgroundColor: !researchGenerated ? 'grey.500' : 'primary.dark',
          },
        }}
      >
        Download PDF
      </Button>
    </Box>
  );

  const renderOutline = (parsedOutline: ResearchSection[]) => {
    return (
      <Box
        sx={{
          mt: 4,
          p: 3,
          bgcolor: 'background.paper',
          borderRadius: 1,
          boxShadow: 1,
        }}
      >
        {parsedOutline.map((item, index) => (
          <Box
            key={index}
            sx={{
              mb: 3,
              '&:last-child': { mb: 0 },
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: 'text.primary',
                mb: item.content ? 1 : 0,
              }}
            >
              {item.number} {item.title}
            </Typography>
            {item.content && (
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  whiteSpace: 'pre-line',
                  mb: 1,
                }}
              >
                {item.content}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    );
  };

  const renderTargetStep = () => {
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Enter Research Topic
        </Typography>
        <TextField
          fullWidth
          variant="outlined"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your research topic..."
        />
        {research.researchTarget && (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Generated Target:
            </Typography>
            <TextField
              fullWidth
              variant="outlined"
              value={research.researchTarget}
              onChange={(e) => dispatch(setResearchTarget(e.target.value))}
              multiline
              rows={2}
            />
          </Box>
        )}
        <Button
          variant="contained"
          onClick={handleGenerateTarget}
          disabled={!query.trim()}
          sx={{
            backgroundColor: research.error ? 'grey.500' : 'primary.main',
            '&:hover': {
              backgroundColor: research.error ? 'grey.500' : 'primary.dark',
            },
          }}
        >
          Generate Target
        </Button>
      </Box>
    );
  };

  const renderProgress = () => {
    if (progressState.progress === 0) return null;

    return (
      <Box sx={{ width: '100%', mb: 4 }}>
        <LinearProgress
          variant="determinate"
          value={progressState.progress}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: 'grey.200',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              backgroundColor: (theme: Theme) =>
                progressState.progress === 100
                  ? theme.palette.success.main
                  : theme.palette.primary.main,
            },
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
          {progressState.message}
        </Typography>
      </Box>
    );
  };

  const handleGenerateTarget = async () => {
    if (!query.trim()) {
      dispatch(setError('Please enter a research topic'));
      return;
    }

    try {
      dispatch(setError(null));
      setProgressState({ progress: 10, message: 'Generating research target...' });

      const targetPrompt = `Clarify and restate the following research topic in one sentence using academic post-graduate language: ${query}`;
      const target = await researchApi.generateTitle(targetPrompt, research.mode, research.type);
      dispatch(setResearchTarget(target));
      setProgressState({ progress: 30, message: 'Research target generated successfully!' });
      setTargetGenerated(true);
      updateButtonColors();
    } catch (error) {
      console.error('Error in handleGenerateTarget:', error);
      if (error instanceof Error) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('An unexpected error occurred. Please try again.'));
      }
      setProgressState({ progress: 0, message: '' });
    }
  };

  const handleGenerateNumberOfSections = async () => {
    setProgressState({ progress: 40, message: 'Generating number of sections...' });
    let min = 0;
    let max = 0;

    if (research.mode === ResearchMode.Basic && research.type === ResearchType.Article) {
      min = 4;
      max = 6;
    } else if (research.mode === ResearchMode.Advanced && research.type === ResearchType.Article) {
      min = 4;
      max = 6;
    } else if (research.mode === ResearchMode.Basic && research.type === ResearchType.General) {
      min = 12;
      max = 18;
    } else if (research.mode === ResearchMode.Advanced && research.type === ResearchType.General) {
      min = 20;
      max = 28;
    } else if (research.mode === ResearchMode.Basic && research.type === ResearchType.Experiment) {
      min = 11;
      max = 19;
    } else if (research.mode === ResearchMode.Advanced && research.type === ResearchType.Experiment) {
      min = 21;
      max = 26;
    }
    setMinSections(min);
    setMaxSections(max);
    setProgressState({ progress: 50, message: 'Number of sections generated successfully!' });
    setSectionsGenerated(true);
    updateButtonColors();
  };

  const handleCreateOutline = async () => {
    if (!research.researchTarget) {
      dispatch(setError('Please generate a research target first'));
      return;
    }
    if (!minSections || !maxSections) {
      dispatch(setError('Please generate number of sections first'));
      return;
    }

    try {
      dispatch(setError(null));
      setProgressState({ progress: 60, message: 'Generating outline...' });

      const outlinePrompt = `Write an outline of prompts to describe a ${research.type} paper about ${research.researchTarget}. It must have a section title followed by 2 to 3 lines of compressed prompt instructions for generating a section. Create a minimum of ${minSections} outline sections and a maximum of ${maxSections}. Number every section title with hierarchical numbering ex: 1., 2., 3., 3.1, 3.2… Each section must be unique to all other sections. This is a ${research.type}. If this is basic or advanced it must start with an abstract section, then an introduction. Do not use any markdown formatting (e.g., '**') for section titles.`;

      let outline = await researchApi.generateDetailedOutline(outlinePrompt, research.mode, research.type);

      // Parse the outline and ensure the number of sections is within the min/max range
      let sections = parseOutline(outline);
      while (sections.length < minSections || sections.length > maxSections) {
        outline = await researchApi.generateDetailedOutline(outlinePrompt, research.mode, research.type);
        sections = parseOutline(outline);
      }

      setParsedOutline(sections);
      dispatch(setSections(sections));

      for (let i = 0; i < sections.length; i++) {
        setProgressState({
          progress: Math.round(((i + 1) / sections.length) * 100),
          message: `Generating outline section ${i + 1} of ${sections.length}: ${sections[i].title}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5-second delay
      }

      setProgressState({ progress: 70, message: 'Outline generated successfully!' });
      setOutlineCreated(true);
      updateButtonColors();
    } catch (error) {
      console.error('Error in handleCreateOutline:', error);
      if (error instanceof Error) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('An unexpected error occurred. Please try again.'));
      }
      setProgressState({ progress: 0, message: '' });
      setParsedOutline([]);
    }
  };

  const handleGenerateResearch = async () => {
    if (!research.sections || research.sections.length === 0) {
      dispatch(setError('Please create an outline first'));
      return;
    }

    try {
      setProgressState({ progress: 70, message: 'Generating research content...' });
      const totalSections = research.sections.length;

      for (let i = 0; i < totalSections; i++) {
        const section = research.sections[i];
        setProgressState({
          progress: Math.round(((i + 1) / totalSections) * 100),
          message: `Generating section ${i + 1} of ${totalSections}: ${section.title}`,
        });

        try {
          const searchPrompt = `Search for relevant academic content about ${research.researchTarget}. Focus on peer-reviewed sources.`;
          const searchResults = await researchApi.generateTitle(searchPrompt, research.mode, research.type);

          const sectionPrompt = `Write detailed academic post-graduate level content about "${section.title}", making it relevant to "${research.researchTarget}". Follow these instructions: ${section.content}. Include the following additional information: ${searchResults}. It must generate about 1750 words. This writing is for a ${research.type} paper. Must find and list relevant valid sources, references, and citations at the end of the section and format them according to the citation format. Do not use any markdown formatting for section titles.`;

          const content = await researchApi.generateTitle(sectionPrompt, research.mode, research.type);

          dispatch(
            setSections([
              ...research.sections.slice(0, i),
              { ...section, content: content },
              ...research.sections.slice(i + 1),
            ])
          );
          await new Promise((resolve) => setTimeout(resolve, 15000)); // 15-second delay
        } catch (error) {
          console.error(`Error generating section ${section.title}:`, error);
          if (error instanceof Error) {
            dispatch(setError(error.message));
          } else {
            dispatch(setError('Failed to generate section content'));
          }
          break;
        }
      }

      setProgressState({ progress: 100, message: 'Research generation complete!' });
      setResearchGenerated(true);
      updateButtonColors();
    } catch (error) {
      console.error('Error generating research:', error);
      if (error instanceof Error) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('Failed to generate research'));
      }
      setProgressState({ progress: 0, message: '' });
    }
  };

  const handleDocumentGeneration = async () => {
    setProgressState({ progress: 90, message: 'Generating documents...' });
    // Placeholder for document generation logic
    setProgressState({ progress: 100, message: 'Documents generated successfully!' });
    updateButtonColors();
  };

  const handleModeChange = (event: SelectChangeEvent<ResearchMode>) => {
    dispatch(setMode(event.target.value as ResearchMode));
  };

  const handleTypeChange = (event: SelectChangeEvent<ResearchType>) => {
    dispatch(setType(event.target.value as ResearchType));
  };

  const handleDownloadWord = async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [new TextRun({ text: `Research Title: ${research.researchTarget}`, bold: true })],
            }),
            ...research.sections.map(
              (section) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: `${section.number} ${section.title}`, bold: true }),
                    new TextRun({ text: `\n${section.content}` }),
                  ],
                })
            ),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const element = document.createElement('a');
    element.href = URL.createObjectURL(blob);
    element.download = 'Research.docx';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadPdf = () => {
    const documentDefinition = {
      content: [
        { text: `Research Title: ${research.researchTarget}`, style: 'header' },
        ...research.sections.map((section) => [
          { text: `${section.number} ${section.title}`, style: 'subheader' },
          { text: section.content },
        ]),
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 20] as [number, number, number, number],
        },
        subheader: {
          fontSize: 14,
          bold: true,
          margin: [0, 10, 0, 5] as [number, number, number, number],
        },
      },
      ...pdfFonts,
    };
    const pdfDocGenerator = pdfMake.createPdf(documentDefinition);
    pdfDocGenerator.getDataUrl((dataUrl: string) => {
      const element = document.createElement('a');
      element.href = dataUrl;
      element.download = 'Research.pdf';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    });
  };

  const updateButtonColors = () => {
    // This function can be used to programmatically update button colors based on progressState
    // Currently handled via the `sx` prop in each Button component
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          {renderSettings()}
        </Grid>

        <Grid item xs={12} md={9}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Research Generator
            </Typography>

            {research.error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {research.error}
              </Alert>
            )}

            {renderTargetStep()}

            {research.researchTarget && (
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleGenerateNumberOfSections}
                    disabled={!targetGenerated}
                    sx={{
                      backgroundColor: targetGenerated ? 'primary.main' : 'grey.500',
                      '&:hover': {
                        backgroundColor: targetGenerated ? 'primary.dark' : 'grey.500',
                      },
                    }}
                  >
                    Generate Number of Sections
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleCreateOutline}
                    disabled={!sectionsGenerated}
                    sx={{
                      backgroundColor: sectionsGenerated ? 'primary.main' : 'grey.500',
                      '&:hover': {
                        backgroundColor: sectionsGenerated ? 'primary.dark' : 'grey.500',
                      },
                    }}
                  >
                    Create Outline
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleGenerateResearch}
                    disabled={!outlineCreated}
                    sx={{
                      backgroundColor: outlineCreated ? 'primary.main' : 'grey.500',
                      '&:hover': {
                        backgroundColor: outlineCreated ? 'primary.dark' : 'grey.500',
                      },
                    }}
                  >
                    Generate Research
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleDocumentGeneration}
                    disabled={!researchGenerated}
                    sx={{
                      backgroundColor: researchGenerated ? 'primary.main' : 'grey.500',
                      '&:hover': {
                        backgroundColor: researchGenerated ? 'primary.dark' : 'grey.500',
                      },
                    }}
                  >
                    Generate Documents
                  </Button>
                </Box>
                {renderDownloadButtons()}
              </Box>
            )}

            {renderProgress()}

            {parsedOutline.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Research Outline
                </Typography>
                {renderOutline(parsedOutline)}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
