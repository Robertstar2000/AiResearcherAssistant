import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  TextField,
  Typography,
  Alert,
  Paper,
  Container,
  Grid,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  SelectChangeEvent
} from '@mui/material';
import {
  setMode, 
  setType, 
  setError,
  setTitle,
  ResearchMode,
  ResearchType,
  setSections
} from '../store/slices/researchSlice';
import {
  generateDetailedOutline,
  generateSection,
  ResearchException,
  ResearchError,
  generateTitle,
  expandResearchTopic
} from '../services/api';
import { parseDetailedOutline } from '../services/researchService';
import { generateWordDocument, generatePdfDocument, downloadDocument } from '../services/documentService';

interface ProgressState {
  progress: number;
  message: string;
}

interface ResearchState {
  mode: ResearchMode;
  type: ResearchType;
  title: string;
  error: string | null;
  sections: any[];
  references: string[];
}

export default function ResearchPage() {
  const dispatch = useDispatch();
  const research = useSelector((state: { research: ResearchState }) => state.research);
  const [query, setQuery] = useState('');
  const [isGeneratingTarget, setIsGeneratingTarget] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingSections, setIsGeneratingSections] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [progressState, setProgressState] = useState<ProgressState>({
    progress: 0,
    message: ''
  });
  const [showOutline, setShowOutline] = useState(false);
  const [outlineWordCount, setOutlineWordCount] = useState(0);
  const [parsedOutline, setParsedOutline] = useState<any[]>([]);
  const [generatedSections, setGeneratedSections] = useState<any[]>([]);
  const [rawOutline, setRawOutline] = useState<string>('');
  const [showRawOutline, setShowRawOutline] = useState(false);
  const [showParsedSections, setShowParsedSections] = useState(false);
  const [showResearchContent, setShowResearchContent] = useState(false);
  const [researchContent, setResearchContent] = useState<string>('');
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [parsedSections, setParsedSections] = useState<Array<{
    title: string;
    content: string[];
    level: number;
  }>>([]);

  // Section range configuration for each mode and type combination
  const sectionRanges: Record<ResearchMode, Record<ResearchType, { min: number; max: number }>> = {
    [ResearchMode.Basic]: {
      [ResearchType.General]: { min: 7, max: 12 },
      [ResearchType.Literature]: { min: 5, max: 11 },
      [ResearchType.Experiment]: { min: 8, max: 12 }
    },
    [ResearchMode.Advanced]: {
      [ResearchType.General]: { min: 22, max: 28 },
      [ResearchType.Literature]: { min: 25, max: 30 },
      [ResearchType.Experiment]: { min: 25, max: 33 }
    },
    [ResearchMode.Article]: {
      [ResearchType.General]: { min: 3, max: 6 },
      [ResearchType.Literature]: { min: 3, max: 7 },
      [ResearchType.Experiment]: { min: 5, max: 8 }
    }
  };

  // Function to get current section range
  const getCurrentSectionRange = (): { min: number; max: number } => {
    const mode = research.mode || ResearchMode.Basic;
    const type = research.type || ResearchType.General;
    
    // Ensure we have valid mode and type
    if (!(mode in sectionRanges) || !(type in sectionRanges[mode])) {
      console.warn(`Invalid mode (${mode}) or type (${type}), using default range`);
      return { min: 5, max: 10 };
    }
    
    return sectionRanges[mode][type];
  };

  const handleGenerateTarget = async () => {
    if (!query.trim()) {
      dispatch(setError('Please enter a research topic'));
      return;
    }

    try {
      setIsGeneratingTarget(true);
      setProgressState({ progress: 10, message: 'Analyzing research topic...' });

      // Clear any previous errors
      dispatch(setError(null));

      // Generate the research target title
      const generatedTitle = await generateTitle(query);
      if (!generatedTitle) {
        throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate research target');
      }

      // Validate the generated title
      if (generatedTitle.length < 10) {
        throw new ResearchException(
          ResearchError.VALIDATION_ERROR,
          'Generated title is too short. Please try again with a more specific topic.'
        );
      }

      setProgressState({ progress: 50, message: 'Finalizing research target...' });
      
      // Update the title in the store
      dispatch(setTitle(generatedTitle));
      
      setProgressState({ progress: 100, message: 'Research target generation complete!' });

    } catch (error) {
      console.error('Error generating target:', error);
      setProgressState({ progress: 0, message: 'Error generating target' });
      
      if (error instanceof ResearchException) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('Failed to generate target. Please try again with a more specific topic.'));
      }
    } finally {
      setIsGeneratingTarget(false);
    }
  };

  const handleGenerateOutline = async () => {
    try {
      setIsGeneratingOutline(true);
      setProgressState({ progress: 10, message: 'Refining research topic...' });
      
      const range = getCurrentSectionRange();

      // First, expand and refine the research topic
      const expandedTopic = await expandResearchTopic(research.title, research.mode, research.type);
      if (!expandedTopic) {
        throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to refine research topic');
      }

      setProgressState({ progress: 30, message: 'Generating outline...' });
      
      // Generate outline with the expanded topic
      const outline = await generateDetailedOutline(
        `${expandedTopic}\ncontain between ${range.min} and ${range.max} main sections`,
        research.mode,
        research.type
      );

      if (!outline) {
        throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate outline');
      }

      handleOutlineGenerated(outline);
      
    } catch (error) {
      console.error('Error generating outline:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Failed to generate outline'));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleOutlineGenerated = async (outline: string) => {
    try {
      setProgressState({ progress: 30, message: 'Processing outline...' });
      const parsedOutline = await parseDetailedOutline(outline);
      
      // If parsing returns empty array, regenerate outline
      if (!parsedOutline.length) {
        console.log('Invalid section count, regenerating outline...');
        setProgressState({ progress: 10, message: 'Regenerating outline...' });
        handleGenerateOutline();
        return;
      }

      setParsedOutline(parsedOutline);
      setOutlineWordCount(calculateOutlineWordCount(parsedOutline));
      setProgressState({ progress: 100, message: 'Outline generation complete!' });
    } catch (error) {
      console.error('Error parsing outline:', error);
      setProgressState({ progress: 0, message: 'Error processing outline' });
    }
  };

  const handleGenerateResearch = async () => {
    if (!showOutline || !parsedOutline || parsedOutline.length === 0) {
      dispatch(setError('Please review the outline first'));
      return;
    }

    try {
      setIsGeneratingSections(true);
      setProgressState({ progress: 0, message: 'Initializing research generation...' });

      // Clear any previous errors
      dispatch(setError(null));

      // Create a dictionary to store section contents
      const sectionContents: { [key: string]: string } = {};
      const totalSections = parsedOutline.length;
      let successfulSections = 0;

      // First, display all sections
      setProgressState({ 
        progress: 5, 
        message: `Analyzing ${totalSections} sections...` 
      });

      console.log('Processing Research Sections:');
      parsedOutline.forEach(section => {
        console.log(`${section.number}. ${section.title}`);
        if (section.description) {
          console.log(`   Description: ${section.description}`);
        }
      });

      // Generate content for each section
      for (let i = 0; i < totalSections; i++) {
        const section = parsedOutline[i];
        const progress = Math.floor((i / totalSections) * 85) + 10;

        setProgressState({
          progress,
          message: `Writing section ${i + 1}/${totalSections}: ${section.title}`
        });

        try {
          // Generate section content
          const content = await generateSection(
            research.title,
            section.title,
            section.description || '',
            research.mode,
            research.type
          );

          if (!content || content.length < 100) {
            throw new ResearchException(
              ResearchError.GENERATION_ERROR,
              `Generated content for section "${section.title}" is too short`
            );
          }

          sectionContents[section.number] = content;
          successfulSections++;

          // Update the generated content immediately
          const newSection = {
            title: section.title,
            content: content,
            number: section.number
          };
          setGeneratedSections(prev => [...prev, newSection]);
          
          // Update Redux store with all current sections
          const updatedSections = [...generatedSections, newSection];
          dispatch(setSections(updatedSections));

        } catch (error) {
          console.error(`Error generating section "${section.title}":`, error);
          const errorMessage = error instanceof ResearchException ? error.message : 'Failed to generate content';
          sectionContents[section.number] = `Error: ${errorMessage}`;
          
          // Show error but continue with other sections
          dispatch(setError(`Warning: Failed to generate section "${section.title}". Continuing with remaining sections...`));
        }
      }

      // Final status update
      if (successfulSections === totalSections) {
        setProgressState({ 
          progress: 100, 
          message: 'Research paper generation complete!' 
        });
      } else {
        setProgressState({ 
          progress: 100, 
          message: `Research generation completed with ${totalSections - successfulSections} failed sections` 
        });
      }

    } catch (error) {
      console.error('Error generating research:', error);
      setProgressState({ progress: 0, message: 'Error generating research' });
      
      if (error instanceof ResearchException) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('Failed to generate research. Please try again.'));
      }
    } finally {
      setIsGeneratingSections(false);
    }
  };

  const handleExportDocument = async (format: 'word' | 'pdf') => {
    setIsGeneratingTarget(true);
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
      setIsGeneratingTarget(false);
    }
  };

  const handleRawOutlineGenerate = async () => {
    if (!research.title) {
      dispatch(setError('Please generate a research target first'));
      return;
    }

    try {
      setIsGeneratingOutline(true);
      setProgressState({ progress: 0, message: 'Generating raw outline...' });

      const outline = await generateDetailedOutline(
        research.title,
        research.mode,
        research.type
      );

      if (!outline) {
        throw new Error('Failed to generate outline');
      }

      setRawOutline(outline);
      setShowRawOutline(true);
      setProgressState({ progress: 100, message: 'Raw outline generation complete!' });

    } catch (error) {
      console.error('Error generating raw outline:', error);
      setProgressState({ progress: 0, message: 'Error generating raw outline' });
      dispatch(setError('Failed to generate raw outline. Please try again.'));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleParsedSectionsDisplay = async () => {
    if (!research.title || !rawOutline) {
      dispatch(setError('Please generate an outline first'));
      return;
    }

    try {
      setIsGeneratingOutline(true);
      setProgressState({ progress: 0, message: 'Processing sections...' });

      const sections = parseOutlineText(rawOutline);
      setParsedSections(sections);
      setCurrentSectionIndex(0);
      setShowParsedSections(true);
      setProgressState({ progress: 100, message: 'Sections processed!' });

    } catch (error) {
      console.error('Error processing sections:', error);
      dispatch(setError('Failed to process sections. Please try again.'));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleResearchContentDisplay = async () => {
    if (!research.title || generatedSections.length === 0) {
      dispatch(setError('Please generate section content first'));
      return;
    }

    try {
      setIsGeneratingContent(true);
      setProgressState({ progress: 0, message: 'Processing research content...' });

      let contentText = '';
      generatedSections.forEach(section => {
        contentText += `### ${section.title}\n\n`;
        contentText += `${section.content}\n\n`;
      });

      setResearchContent(contentText);
      setShowResearchContent(true);
      setProgressState({ progress: 100, message: 'Research content processed!' });

    } catch (error) {
      console.error('Error processing research content:', error);
      dispatch(setError('Failed to process research content. Please try again.'));
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const parseOutlineText = (text: string): Array<{
    title: string;
    content: string[];
    level: number;
  }> => {
    const lines = text.split('\n').filter(line => line.trim());
    const sections: Array<{
      title: string;
      content: string[];
      level: number;
    }> = [];
    let currentSection: {
      title: string;
      content: string[];
      level: number;
    } | null = null;

    const isSectionStart = (line: string): boolean => {
      return /^(?:\d+\.|[A-Za-z]\.|•|\*|\-)\s+/.test(line.trim());
    };

    const getSectionLevel = (line: string): number => {
      const trimmed = line.trim();
      if (/^\d+\./.test(trimmed)) return 1;
      if (/^[A-Za-z]\./.test(trimmed)) return 2;
      if (/^[•\*\-]/.test(trimmed)) return 3;
      return 1;
    };

    const extractTitle = (line: string): string => {
      return line.trim().replace(/^(?:\d+\.|[A-Za-z]\.|•|\*|\-)\s+/, '');
    };

    lines.forEach(line => {
      if (isSectionStart(line)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: extractTitle(line),
          content: [],
          level: getSectionLevel(line)
        };
      } else if (currentSection) {
        currentSection.content.push(line.trim());
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  };

  const handleNextSection = () => {
    if (currentSectionIndex < parsedSections.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
    }
  };

  const handlePrevSection = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(prev => prev - 1);
    }
  };

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const calculateOutlineWordCount = (outlineItems: any[]): number => {
    return outlineItems.reduce((total, item) => {
      return total + countWords(item.title);
    }, 0);
  };

  const renderProgress = () => {
    if (!isGeneratingOutline && !isGeneratingSections && !isGeneratingContent) return null;
    
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

  const handleModeChange = (e: SelectChangeEvent<string>) => {
    dispatch(setMode(e.target.value as ResearchMode));
  };

  const handleTypeChange = (e: SelectChangeEvent<string>) => {
    dispatch(setType(e.target.value as ResearchType));
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
          <MenuItem value={ResearchType.Experiment}>Experimental Research</MenuItem>
        </Select>
      </FormControl>

      {/* Update buttons section to dots */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button
          variant="contained"
          size="small"
          onClick={handleRawOutlineGenerate}
          disabled={isGeneratingOutline || !research.title}
          sx={{
            minWidth: '24px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            padding: 0,
            backgroundColor: '#4CAF50', // Green
            '&:hover': {
              backgroundColor: '#45a049'
            }
          }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={handleParsedSectionsDisplay}
          disabled={isGeneratingOutline || !rawOutline}
          sx={{
            minWidth: '24px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            padding: 0,
            backgroundColor: '#2196F3', // Blue
            '&:hover': {
              backgroundColor: '#1976D2'
            }
          }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={handleResearchContentDisplay}
          disabled={isGeneratingContent || generatedSections.length === 0}
          sx={{
            minWidth: '24px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            padding: 0,
            backgroundColor: '#FF9800', // Orange
            '&:hover': {
              backgroundColor: '#F57C00'
            }
          }}
        />
      </Box>

      {/* Raw Outline Display */}
      {showRawOutline && (
        <Paper 
          elevation={1} 
          sx={{ 
            p: 2, 
            mt: 2, 
            maxHeight: '300px', 
            overflowY: 'auto',
            backgroundColor: '#f5f5f5'
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            Raw Outline:
          </Typography>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {rawOutline}
          </pre>
          <Button 
            size="small" 
            onClick={() => setShowRawOutline(false)}
            sx={{ mt: 1 }}
          >
            Close
          </Button>
        </Paper>
      )}
    </Paper>
  );

  const exportButtons = (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Tooltip title={!research.sections.length ? 'Generate research first' : 'Download as Word'}>
        <span>
          <Button
            variant="contained"
            onClick={() => handleExportDocument('word')}
            disabled={!research.sections.length || isGeneratingTarget}
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
            disabled={!research.sections.length || isGeneratingTarget}
            startIcon={<></>}
          >
            PDF
          </Button>
        </span>
      </Tooltip>
    </Box>
  );

  const renderOutline = () => {
    if (!parsedOutline.length) return null;
    
    return (
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
            <Typography variant="body1" style={{ fontWeight: 'bold', marginTop: '16px' }}>
              {item.isSubsection ? '•' : `${index + 1}.`} {item.title}
            </Typography>
            {item.description && (
              <div style={{ marginLeft: '20px', whiteSpace: 'pre-line' }}>
                {item.description}
              </div>
            )}
          </Box>
        ))}
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'grey.300' }}>
          <Typography variant="body2" color="textSecondary">
            Total word count in outline: {outlineWordCount}
          </Typography>
        </Box>
      </Paper>
    );
  };

  const renderGeneratedContent = () => {
    if (!generatedSections.length) return null;

    return (
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
            {section.description && (
              <div style={{ marginLeft: '20px', whiteSpace: 'pre-line' }}>
                {section.description}
              </div>
            )}
            <Typography sx={{ ml: section.isSubsection ? 4 : 0 }}>
              {section.content}
            </Typography>
          </Box>
        ))}
      </Paper>
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
          disabled={isGeneratingTarget}
          sx={{ mb: 2 }}
        />
        {research.title && (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Generated Target:
            </Typography>
            <TextField
              fullWidth
              variant="outlined"
              value={research.title}
              onChange={(e) => dispatch(setTitle(e.target.value))}
              multiline
              rows={2}
            />
          </Box>
        )}
        <Button
          variant="contained"
          onClick={handleGenerateTarget}
          disabled={!query.trim() || isGeneratingTarget}
          startIcon={isGeneratingTarget ? <CircularProgress size={20} /> : null}
        >
          {isGeneratingTarget ? 'Generating...' : 'Generate Target'}
        </Button>
      </Box>
    );
  };

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

            {renderTargetStep()}

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
                      onClick={() => setShowOutline(true)}
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
                {renderOutline()}
              </Box>
            )}

            {generatedSections.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Generated Content
                </Typography>
                {renderGeneratedContent()}
              </Box>
            )}

            {showParsedSections && (
              <Paper 
                elevation={1} 
                sx={{ 
                  p: 2, 
                  mt: 2, 
                  maxHeight: '300px', 
                  overflowY: 'auto',
                  backgroundColor: '#f5f5f5'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2">
                    Section {currentSectionIndex + 1} of {parsedSections.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      size="small" 
                      onClick={handlePrevSection}
                      disabled={currentSectionIndex === 0}
                    >
                      Previous
                    </Button>
                    <Button 
                      size="small" 
                      onClick={handleNextSection}
                      disabled={currentSectionIndex === parsedSections.length - 1}
                    >
                      Next
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => setShowParsedSections(false)}
                    >
                      Close
                    </Button>
                  </Box>
                </Box>
                
                {parsedSections[currentSectionIndex] && (
                  <Box>
                    <Typography 
                      variant="subtitle1" 
                      sx={{ 
                        fontWeight: 'bold',
                        ml: (parsedSections[currentSectionIndex].level - 1) * 2
                      }}
                    >
                      {parsedSections[currentSectionIndex].title}
                    </Typography>
                    {parsedSections[currentSectionIndex].content.map((line, idx) => (
                      <Typography 
                        key={idx} 
                        sx={{ 
                          ml: parsedSections[currentSectionIndex].level * 2,
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {line}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Paper>
            )}

            {showResearchContent && (
              <Paper 
                elevation={1} 
                sx={{ 
                  p: 2, 
                  mt: 2, 
                  maxHeight: '300px', 
                  overflowY: 'auto',
                  backgroundColor: '#f5f5f5'
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Research Content:
                </Typography>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {researchContent}
                </div>
                <Button 
                  size="small" 
                  onClick={() => setShowResearchContent(false)}
                  sx={{ mt: 1 }}
                >
                  Close
                </Button>
              </Paper>
            )}

            {renderProgress()}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}
