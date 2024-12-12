import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  Box,
  CircularProgress,
  Alert,
  Tooltip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  SelectChangeEvent
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import { RootState } from '../store';
import { 
  setMode, 
  setType, 
  setSections, 
  setError,
  setTitle,
  ResearchMode,
  ResearchType
} from '../store/slices/researchSlice';
import {
  generateDetailedOutline,
  generateSection,
  ResearchException,
  ResearchError,
  generateTitle
} from '../services/api';
import { parseDetailedOutline } from '../services/researchService';
import { generateWordDocument, generatePdfDocument, downloadDocument } from '../services/documentService';

interface ProgressState {
  progress: number;
  message: string;
}

export default function ResearchPage() {
  const dispatch = useDispatch();
  const research = useSelector((state: RootState) => state.research);
  const [query, setQuery] = useState('');
  const [isGeneratingTarget, setIsGeneratingTarget] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingSections, setIsGeneratingSections] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [progressState, setProgressState] = useState<ProgressState>({
    progress: 0,
    message: '',
  });
  const [showOutline, setShowOutline] = useState(false);
  const [outlineWordCount, setOutlineWordCount] = useState(0);
  const [parsedOutline, setParsedOutline] = useState<any[]>([]);
  const [generatedSections, setGeneratedSections] = useState<any[]>([]);

  const handleModeChange = (e: SelectChangeEvent<string>) => {
    dispatch(setMode(e.target.value as ResearchMode));
  };

  const handleTypeChange = (e: SelectChangeEvent<string>) => {
    dispatch(setType(e.target.value as ResearchType));
  };

  const handleGenerateTarget = async () => {
    setIsGeneratingTarget(true);
    dispatch(setError(null));

    try {
      const researchTarget = await generateTitle(query);
      dispatch(setTitle(researchTarget));
    } catch (error) {
      console.error('Error generating research target:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Failed to generate research target'));
    } finally {
      setIsGeneratingTarget(false);
    }
  };

  const handleGenerateOutline = async () => {
    if (!research.title) {
      dispatch(setError('Please generate a research target first'));
      return;
    }

    setIsGeneratingOutline(true);
    setShowOutline(false);
    dispatch(setError(null));
    setProgressState({ progress: 0, message: 'Starting outline generation...' });

    try {
      // Generate outline based on research settings and combined prompts
      setProgressState({ progress: 10, message: 'Generating outline...' });
      
      // Combine all available context for the outline generation
      const combinedPrompt = `Research Topic: ${query}
Research Target: ${research.title}
Research Mode: ${research.mode}
Research Type: ${research.type}

Additional Context:
- This is a ${research.mode.toLowerCase()} research paper
- The research type is ${research.type.toLowerCase()}
- The target audience should match the research mode and type
- The structure should follow academic standards for this type of research

${getSectionRecommendations(research.mode)}

Requirements:
- Create a clear, hierarchical structure
- Use numbers for main sections (1., 2., etc.)
- Use letters for subsections (a., b., etc.)
- Include brief descriptions of what each section should cover
- Ensure the outline supports the research target
- Maintain logical flow between sections`;

      const outline = await generateDetailedOutline(
        combinedPrompt,
        research.mode.toLowerCase(),
        research.type.toLowerCase()
      );

      if (!outline) {
        throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate outline');
      }

      // Parse outline into sections
      setProgressState({ progress: 30, message: 'Processing outline...' });
      const outlineItems = parseDetailedOutline(outline);
      setParsedOutline(outlineItems);
      setOutlineWordCount(calculateOutlineWordCount(outlineItems));
      setProgressState({ progress: 100, message: 'Outline generation complete!' });
      
    } catch (error) {
      console.error('Error generating outline:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Failed to generate outline'));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleGenerateResearch = async () => {
    if (!showOutline || parsedOutline.length === 0) {
      dispatch(setError('Please review the outline first'));
      return;
    }

    setIsGeneratingSections(true);
    setGeneratedSections([]);
    dispatch(setError(null));
    setProgressState({ progress: 0, message: 'Starting section generation...' });

    try {
      // Generate content for each section
      let sections: any[] = [];
      let totalSections = parsedOutline.length;
      
      for (let i = 0; i < parsedOutline.length; i++) {
        const item = parsedOutline[i];
        setProgressState({
          progress: Math.floor((i / totalSections) * 100),
          message: `Generating section ${i + 1} of ${totalSections}: ${item.title}`
        });

        const section = await generateSection(
          research.title,
          item.title,
          item.isSubsection
        );
        sections.push({
          ...item,
          content: section
        });
        setGeneratedSections([...sections]); // Update UI with each new section
      }

      // Update store with generated content
      setProgressState({ progress: 90, message: 'Finalizing research...' });
      dispatch(setSections(sections));

      setProgressState({ progress: 100, message: 'Research generation complete!' });
    } catch (error) {
      console.error('Error generating research:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Failed to generate research'));
    } finally {
      setIsGeneratingSections(false);
    }
  };

  const handleExportDocument = async (format: 'word' | 'pdf') => {
    setIsLoading(true);
    try {
      const documentOptions = {
        title: research.title,
        author: 'AI Researcher',
        sections: research.sections,
        references: research.references
      };

      let blob: Blob;
      if (format === 'word') {
        blob = await generateWordDocument(documentOptions);
        downloadDocument(blob, `${research.title.replace(/\s+/g, '_')}.docx`);
      } else {
        blob = await generatePdfDocument(
          {
            title: research.title,
            author: 'AI Researcher',
            created: new Date()
          },
          research.sections,
          research.references
        );
        downloadDocument(blob, `${research.title.replace(/\s+/g, '_')}.pdf`);
      }
    } catch (error) {
      if (error instanceof Error) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError(`Failed to generate ${format.toUpperCase()} document`));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTitleEdit = () => {
    setEditedTitle(research.title);
    setEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (editedTitle.trim()) {
      dispatch(setTitle(editedTitle.trim()))
    }
    setEditingTitle(false)
  }

  const handleTitleCancel = () => {
    setEditingTitle(false)
    setEditedTitle('')
  }

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const calculateOutlineWordCount = (outlineItems: any[]): number => {
    return outlineItems.reduce((total, item) => {
      return total + countWords(item.title);
    }, 0);
  };

  const handleShowOutline = () => {
    setShowOutline(true);
  };

  const renderProgress = () => {
    if (!isGeneratingOutline && !isGeneratingSections) return null;
    
    return (
      <Box sx={{ width: '100%', mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              {progressState.message}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {Math.round(progressState.progress)}%
          </Typography>
        </Box>
        <CircularProgress 
          variant="determinate" 
          value={progressState.progress} 
          sx={{ 
            height: 8,
            borderRadius: 4,
            backgroundColor: 'grey.200',
            '& .MuiCircularProgress-circle': {
              borderRadius: 4,
              backgroundColor: 'primary.main'
            }
          }}
        />
      </Box>
    );
  };

  const renderSettings = () => (
    <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Research Settings
      </Typography>
      
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Mode</InputLabel>
        <Select
          value={research.mode}
          label="Mode"
          onChange={handleModeChange}
        >
          <MenuItem value={ResearchMode.Basic}>Basic</MenuItem>
          <MenuItem value={ResearchMode.Advanced}>Advanced</MenuItem>
          <MenuItem value={ResearchMode.Article}>Article</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={research.type}
          label="Type"
          onChange={handleTypeChange}
        >
          <MenuItem value={ResearchType.General}>General Research</MenuItem>
          <MenuItem value={ResearchType.Literature}>Literature Review</MenuItem>
          <MenuItem value={ResearchType.Experiment}>Experiment Design</MenuItem>
        </Select>
      </FormControl>
    </Paper>
  );

  const exportButtons = (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Tooltip title={!research.sections.length ? 'Generate research first' : 'Download as Word'}>
        <span>
          <Button
            variant="contained"
            onClick={() => handleExportDocument('word')}
            disabled={!research.sections.length || isLoading}
            startIcon={<></>}
          >
            Word
          </Button>
        </span>
      </Tooltip>
      <Tooltip title={!research.sections.length ? 'Generate research first' : 'Download as PDF'}>
        <span>
          <Button
            variant="contained"
            onClick={() => handleExportDocument('pdf')}
            disabled={!research.sections.length || isLoading}
            startIcon={<></>}
          >
            PDF
          </Button>
        </span>
      </Tooltip>
    </Box>
  );

  useEffect(() => {
    // Initialize real-time subscription for updates
    const cleanup = () => {
      // Handle real-time updates
    }

    return () => {
      cleanup()
    }
  }, [dispatch])

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Settings Panel */}
        <Grid item xs={12} md={3}>
          {renderSettings()}
        </Grid>

        {/* Main Content */}
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

            <Box sx={{ mb: 3 }}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <TextField
                  label="Research Topic"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter your research topic"
                  fullWidth
                  variant="outlined"
                  disabled={isGeneratingTarget || isGeneratingOutline || isGeneratingSections}
                />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleGenerateTarget}
                  disabled={!query || isGeneratingTarget || isGeneratingOutline || isGeneratingSections}
                >
                  {isGeneratingTarget ? 'Generating Target...' : 'Generate Target'}
                </Button>
              </Box>
            </Box>

            {research.title && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Research Target
                </Typography>
                {editingTitle ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                      fullWidth
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      label="Research Target"
                      variant="outlined"
                      size="small"
                    />
                    <Tooltip title="Save Target">
                      <IconButton 
                        onClick={handleTitleSave}
                        color="primary"
                        size="small"
                      >
                        <SaveIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancel">
                      <IconButton
                        onClick={handleTitleCancel}
                        color="error"
                        size="small"
                      >
                        <CloseIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ flex: 1 }}>{research.title}</Typography>
                    <Tooltip title="Edit Research Target">
                      <IconButton
                        onClick={handleTitleEdit}
                        size="small"
                        sx={{ ml: 1 }}
                      >
                        <></>
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            )}

            {research.title && (
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleGenerateOutline}
                    disabled={isGeneratingOutline || isGeneratingSections}
                  >
                    {isGeneratingOutline ? 'Generating Outline...' : 'Generate Outline'}
                  </Button>
                  {parsedOutline.length > 0 && !showOutline && (
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={handleShowOutline}
                      disabled={isGeneratingOutline || isGeneratingSections}
                      sx={{ 
                        animation: !showOutline ? 'pulse 1.5s infinite' : 'none',
                        '@keyframes pulse': {
                          '0%': { boxShadow: '0 0 0 0 rgba(156, 39, 176, 0.4)' },
                          '70%': { boxShadow: '0 0 0 10px rgba(156, 39, 176, 0)' },
                          '100%': { boxShadow: '0 0 0 0 rgba(156, 39, 176, 0)' }
                        }
                      }}
                    >
                      Show Outline
                    </Button>
                  )}
                  {showOutline && (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleGenerateResearch}
                      disabled={isGeneratingSections}
                      sx={{ 
                        animation: 'pulse 1.5s infinite',
                        '@keyframes pulse': {
                          '0%': { boxShadow: '0 0 0 0 rgba(25, 118, 210, 0.4)' },
                          '70%': { boxShadow: '0 0 0 10px rgba(25, 118, 210, 0)' },
                          '100%': { boxShadow: '0 0 0 0 rgba(25, 118, 210, 0)' }
                        }
                      }}
                    >
                      {isGeneratingSections ? 'Generating Research...' : 'Generate Research'}
                    </Button>
                  )}
                  {exportButtons}
                </Box>
              </Box>
            )}

            {showOutline && parsedOutline.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Research Outline
                </Typography>
                <Paper 
                  elevation={0} 
                  sx={{ 
                    p: 2, 
                    bgcolor: 'grey.50',
                    maxHeight: '400px',
                    overflow: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: 'grey.100',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'grey.400',
                      borderRadius: '4px',
                    },
                  }}
                >
                  {parsedOutline.map((item, index) => (
                    <Box key={index} sx={{ ml: item.isSubsection ? 4 : 0, mb: 1 }}>
                      <Typography>
                        {item.isSubsection ? '•' : `${index + 1}.`} {item.title}
                      </Typography>
                    </Box>
                  ))}
                  <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'grey.300' }}>
                    <Typography variant="body2" color="textSecondary">
                      Total word count in outline: {outlineWordCount}
                    </Typography>
                  </Box>
                </Paper>
              </Box>
            )}

            {generatedSections.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Generated Content
                </Typography>
                <Paper 
                  elevation={0} 
                  sx={{ 
                    p: 2, 
                    bgcolor: 'grey.50',
                    maxHeight: '600px',
                    overflow: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: 'grey.100',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'grey.400',
                      borderRadius: '4px',
                    },
                  }}
                >
                  {generatedSections.map((section, index) => (
                    <Box key={index} sx={{ mb: 3 }}>
                      <Typography variant="h6" sx={{ ml: section.isSubsection ? 4 : 0, mb: 1 }}>
                        {section.isSubsection ? '•' : `${index + 1}.`} {section.title}
                      </Typography>
                      <Typography sx={{ ml: section.isSubsection ? 4 : 0 }}>
                        {section.content}
                      </Typography>
                    </Box>
                  ))}
                </Paper>
              </Box>
            )}

            {renderProgress()}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}

const getSectionRecommendations = (mode: string) => {
  switch (mode.toLowerCase()) {
    case 'article':
      return `
Recommended Section Structure:
- 8 main sections: Abstract, Introduction, Literature Review, Methodology, Results, Discussion, Conclusion, References
- Each main section should have 3-4 subsections
- Total expected sections: ~30 (8 main + ~22 subsections)`;
    case 'literature review':
      return `
Recommended Section Structure:
- 6 main sections: Introduction, Review Methodology, Literature Analysis, Findings Synthesis, Discussion, Conclusion
- Each main section should have 3 subsections
- Total expected sections: ~24 (6 main + ~18 subsections)`;
    case 'technical':
      return `
Recommended Section Structure:
- 7 main sections: Abstract, Introduction, Background, Methodology, Implementation, Results, Conclusion
- Each main section should have 2-3 subsections
- Total expected sections: ~25 (7 main + ~18 subsections)`;
    default:
      return `
Recommended Section Structure:
- 5-7 main sections
- Each main section should have 2-3 subsections
- Total expected sections: ~20-25 sections`;
  }
};
