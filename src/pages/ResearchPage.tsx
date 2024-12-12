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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [progressState, setProgressState] = useState<ProgressState>({
    progress: 0,
    message: '',
  });

  const handleModeChange = (e: SelectChangeEvent<string>) => {
    dispatch(setMode(e.target.value as ResearchMode));
  };

  const handleTypeChange = (e: SelectChangeEvent<string>) => {
    dispatch(setType(e.target.value as ResearchType));
  };

  const handleGenerateResearch = async () => {
    setIsGenerating(true);
    dispatch(setError(null));
    setProgressState({ progress: 0, message: 'Starting research generation...' });

    try {
      // Step 1: Generate research target
      setProgressState({ progress: 5, message: 'Generating research target...' });
      const researchTarget = await generateTitle(query);
      dispatch(setTitle(researchTarget));

      // Step 2: Generate outline based on research settings
      setProgressState({ progress: 10, message: 'Generating outline...' });
      const outline = await generateDetailedOutline(
        query,
        research.mode.toLowerCase(),
        research.type.toLowerCase()
      );

      if (!outline) {
        throw new ResearchException(ResearchError.GENERATION_ERROR, 'Failed to generate outline');
      }

      // Step 3: Parse outline into sections
      setProgressState({ progress: 30, message: 'Processing outline...' });
      const outlineItems = parseDetailedOutline(outline);
      
      // Step 4: Generate content for each section
      let sections: any[] = [];
      let totalSections = outlineItems.length;
      
      for (let i = 0; i <outlineItems.length; i++) {
        const item = outlineItems[i];
        setProgressState({
          progress: 30 + Math.floor((i / totalSections) * 60),
          message: `Generating section ${i + 1} of ${totalSections}: ${item.title}`
        });

        const section = await generateSection(
          query,
          item.title,
          item.isSubsection
        );

        sections.push(section);
      }

      // Step 5: Update store with generated content
      setProgressState({ progress: 90, message: 'Finalizing research...' });
      dispatch(setSections(sections));

      setProgressState({ progress: 100, message: 'Research generation complete!' });
    } catch (error) {
      if (error instanceof Error) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('Failed to generate research'));
      }
    } finally {
      setIsGenerating(false);
      setProgressState({ progress: 0, message: '' });
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

  const renderProgress = () => {
    if (!isGenerating) return null;
    
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
                  disabled={isGenerating}
                />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleGenerateResearch}
                  disabled={isGenerating || !query.trim()}
                >
                  Generate Research
                </Button>
                {exportButtons}
              </Box>
            </Box>

            {renderProgress()}

            {research.title && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Target for Research:
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
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}
