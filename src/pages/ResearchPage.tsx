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
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { generateResearch } from '../services/researchService';
import { RootState } from '../store';
import { 
  setMode, 
  setType, 
  setSections, 
  setReferences, 
  setError,
  setTitle,
  ResearchMode,
  ResearchType
} from '../store/slices/researchSlice';
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

  const handleModeChange = (event: any) => {
    dispatch(setMode(event.target.value as ResearchMode));
  };

  const handleTypeChange = (event: any) => {
    dispatch(setType(event.target.value as ResearchType));
  };

  const handleGenerateResearch = async () => {
    if (!query) {
      dispatch(setError('Please enter a research topic'));
      return;
    }

    setIsGenerating(true);
    dispatch(setError(null));
    setProgressState({ progress: 0, message: 'Starting research generation...' });

    try {
      const result = await generateResearch(
        query,
        (progress: number, message: string) => {
          setProgressState({ progress, message });
        }
      );

      dispatch(setSections(result.sections));
      dispatch(setReferences(result.references));
      dispatch(setTitle(query));
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
          <MenuItem value="Basic">Basic</MenuItem>
          <MenuItem value="Advanced">Advanced</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={research.type}
          label="Type"
          onChange={handleTypeChange}
        >
          <MenuItem value="General">General Research</MenuItem>
          <MenuItem value="Literature">Literature Review</MenuItem>
          <MenuItem value="Experiment">Experiment Design</MenuItem>
        </Select>
      </FormControl>
    </Paper>
  );

  const handleDownloadWord = async () => {
    try {
      if (!research.sections || research.sections.length === 0) {
        dispatch(setError('No research content to download'));
        return;
      }

      setIsLoading(true);
      const blob = await generateWordDocument({
        title: research.title,
        author: 'Anonymous',
        sections: research.sections,
        references: research.references || []
      });
      downloadDocument(blob, `${research.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx`);
    } catch (error) {
      dispatch(setError('Failed to generate Word document'));
      console.error('Word document generation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      if (!research.sections || research.sections.length === 0) {
        dispatch(setError('No research content to download'));
        return;
      }

      setIsLoading(true);
      const blob = await generatePdfDocument(
        {
          title: research.title,
          author: 'Anonymous',
          created: new Date()
        },
        research.sections,
        research.references || []
      );
      downloadDocument(blob, `${research.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } catch (error) {
      dispatch(setError('Failed to generate PDF document'));
      console.error('PDF document generation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportButtons = (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Tooltip title={!research.sections.length ? 'Generate research first' : 'Download as Word'}>
        <span>
          <Button
            variant="contained"
            onClick={handleDownloadWord}
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
            onClick={handleDownloadPdf}
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
    // Initialize real-time subscription
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
                <InputLabel>Target Research Topic</InputLabel>
                <Select
                  value={query}
                  label="Target Research Topic"
                  onChange={(e) => setQuery(e.target.value)}
                >
                  <MenuItem value="Topic 1">Topic 1</MenuItem>
                  <MenuItem value="Topic 2">Topic 2</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleGenerateResearch}
                  disabled={!query || isGenerating}
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
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>Title</InputLabel>
                      <Select
                        value={editedTitle}
                        label="Title"
                        onChange={(e) => setEditedTitle(e.target.value)}
                      >
                        <MenuItem value="Title 1">Title 1</MenuItem>
                        <MenuItem value="Title 2">Title 2</MenuItem>
                      </Select>
                    </FormControl>
                    <Tooltip title="Save Target">
                      <IconButton 
                        onClick={handleTitleSave}
                        color="primary"
                        size="small"
                      >
                        <></>
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
