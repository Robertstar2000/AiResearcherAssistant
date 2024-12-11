import { useState, useEffect } from 'react';
import {
  Button,
  CircularProgress,
  Container,
  Typography,
  Box,
  Grid,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tooltip,
  Alert,
  SelectChangeEvent
} from '@mui/material';
import {
  ResearchMode,
  ResearchType,
  CitationStyle,
  setTitle,
  setMode,
  setType,
  setCitationStyle,
  setLoading,
  setError,
  setSections,
  setReferences,
  addToHistory,
  ResearchSection
} from '../store/slices/researchSlice';
import { RootState } from '../store';
import { useSelector, useDispatch } from 'react-redux';
import { generateTitle } from '../services/api';
import { generateResearch } from '../services/researchService';
import { generatePdfDocument, generateWordDocument, downloadDocument } from '../services/documentService';
import { initializeRealtimeSubscription } from '../services/databaseService';
import { ResearchError, ResearchException } from '../services/researchErrors';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';

interface ProgressState {
  progress: number;
  message: string;
}

const ResearchPage = () => {
  const dispatch = useDispatch();
  const research = useSelector((state: RootState) => state.research);
  const user = useSelector((state: RootState) => state.auth.user);
  const [query, setQuery] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [progressState, setProgressState] = useState<ProgressState>({
    progress: 0,
    message: '',
  })
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outline, setOutline] = useState('')

  const updateProgress = (progress: number, total: number, message: string) => {
    setProgressState({
      progress: (progress / total) * 100,
      message,
    })
  }

  const handleModeChange = (event: SelectChangeEvent<ResearchMode>) => {
    dispatch(setMode(event.target.value as ResearchMode))
  }

  const handleTypeChange = (event: SelectChangeEvent<ResearchType>) => {
    dispatch(setType(event.target.value as ResearchType))
  }

  const handleCitationStyleChange = (event: SelectChangeEvent<CitationStyle>) => {
    dispatch(setCitationStyle(event.target.value as CitationStyle))
  }

  const handleGenerateTitle = async () => {
    if (!query.trim()) {
      dispatch(setError('Please enter a research query'))
      return
    }

    dispatch(setSections([]))
    dispatch(setReferences([]))
    dispatch(setLoading(true))
    dispatch(setError(null))

    try {
      const generatedTitle = await generateTitle(query)
      dispatch(setTitle(generatedTitle))
    } catch (error) {
      if (error instanceof ResearchException) {
        dispatch(setError(error.message))
      } else {
        dispatch(setError('Failed to generate title'))
      }
    } finally {
      dispatch(setLoading(false))
    }
  }

  const handleGenerateResearch = async () => {
    if (!query) {
      dispatch(setError('Please enter a research topic'))
      return
    }

    setIsLoading(true)
    try {
      const result = await generateResearch(query, (progress, total, message) => {
        updateProgress(progress, total, message);
      });
      setOutline(result.outline)
      dispatch(setSections(result.sections))
      dispatch(setReferences(result.references))
    } catch (error) {
      if (error instanceof ResearchException) {
        dispatch(setError(error.message))
      } else {
        dispatch(setError('Failed to generate research'))
      }
    } finally {
      setIsLoading(false)
    }
  };

  const handleTitleEdit = () => {
    setEditedTitle(research.title)
    setEditingTitle(true)
  }

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
    if (!isLoading) return null;
    
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
        <LinearProgress 
          variant="determinate" 
          value={progressState.progress} 
          sx={{ 
            height: 8,
            borderRadius: 4,
            backgroundColor: 'grey.200',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              backgroundColor: 'primary.main'
            }
          }}
        />
      </Box>
    );
  };

  const renderOutlineButton = () => (
    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
      <Tooltip title={outline ? "View Research Outline" : "Generate research to view outline"}>
        <span>
          <Button
            variant="contained"
            onClick={() => setOutlineOpen(true)}
            disabled={!outline}
            startIcon={<FormatListBulletedIcon />}
            sx={{ 
              minWidth: '200px',
              backgroundColor: outline ? 'primary.main' : 'grey.500',
              '&:hover': {
                backgroundColor: outline ? 'primary.dark' : 'grey.600'
              },
              '&.Mui-disabled': {
                backgroundColor: 'grey.300',
                color: 'grey.500'
              }
            }}
          >
            View Outline
          </Button>
        </span>
      </Tooltip>
    </Box>
  );

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
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={research.type}
          label="Type"
          onChange={handleTypeChange}
        >
          <MenuItem value={ResearchType.Article}>Article</MenuItem>
          <MenuItem value={ResearchType.General}>General Research</MenuItem>
          <MenuItem value={ResearchType.Literature}>Literature Review</MenuItem>
          <MenuItem value={ResearchType.Experiment}>Experiment Design</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 4 }}>
        <InputLabel>Citation Style</InputLabel>
        <Select
          value={research.citationStyle}
          label="Citation Style"
          onChange={handleCitationStyleChange}
        >
          <MenuItem value={CitationStyle.APA}>APA</MenuItem>
          <MenuItem value={CitationStyle.MLA}>MLA</MenuItem>
          <MenuItem value={CitationStyle.Chicago}>Chicago</MenuItem>
        </Select>
      </FormControl>

      <Paper 
        elevation={1} 
        sx={{ 
          p: 2, 
          mb: 2, 
          backgroundColor: 'background.default',
          border: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontSize: '0.8rem' }}>
          Instructions
        </Typography>
        <Box component="ol" sx={{ pl: 2, m: 0 }}>
          <Typography component="li" variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
            Enter your research topic in the search field
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
            Click "Generate Title" to create a formal research title
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
            Select Mode (Basic: 8-10 sections, Advanced: 30-40 sections)
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
            Choose Type (Article, General Research, Literature Review, or Experiment)
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
            Select Citation Style (APA, MLA, or Chicago)
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
            Click "Generate Research" to create your document
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5, fontSize: '0.75rem' }}>
            Review the outline using the outline button
          </Typography>
          <Typography component="li" variant="body2" sx={{ fontSize: '0.75rem' }}>
            Export to your preferred format (Markup, PDF, or Word)
          </Typography>
        </Box>
      </Paper>
    </Paper>
  );

  const OutlineDialog = () => (
    <Dialog
      open={outlineOpen}
      onClose={() => setOutlineOpen(false)}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          minHeight: '80vh',
          maxHeight: '90vh',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
        backgroundColor: 'primary.main',
        color: 'white',
        p: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormatListBulletedIcon />
          <Typography variant="h6">Research Outline</Typography>
        </Box>
        <IconButton
          aria-label="close"
          onClick={() => setOutlineOpen(false)}
          size="small"
          sx={{ color: 'white' }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ 
          whiteSpace: 'pre-wrap', 
          fontFamily: 'monospace',
          fontSize: '1rem',
          lineHeight: 1.6,
          p: 3,
          height: '100%',
          overflow: 'auto'
        }}>
          {outline.split('\n').map((line, index) => {
            // Add indentation based on section level
            const level = (line.match(/^\d+(\.\d+)*\./) || [''])[0].split('.').length - 1;
            const indent = level * 24; // 24px indent per level
            
            // Style section titles differently
            const isTitle = line.match(/^\d+(\.\d+)*\./);
            const isRequirement = line.trim().startsWith('-');
            
            return (
              <div 
                key={index} 
                style={{ 
                  paddingLeft: `${indent}px`,
                  marginBottom: '0.5rem',
                  color: isTitle ? '#1976d2' : 
                         isRequirement ? '#666' : 'inherit',
                  fontWeight: isTitle ? 600 : 
                              isRequirement ? 400 : 500
                }}
              >
                {line}
              </div>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );

  const handleDownloadWord = async () => {
    try {
      if (!user || !user.name) {
        dispatch(setError('Please sign in to download documents'));
        return;
      }

      if (!research.sections || research.sections.length === 0) {
        dispatch(setError('No research content available'));
        return;
      }

      setIsLoading(true);
      const blob = await generateWordDocument({
        title: research.title,
        author: user.name,
        sections: research.sections,
        references: research.references || []
      });

      downloadDocument(blob, `${research.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx`);
    } catch (error) {
      if (error instanceof ResearchException) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('Failed to generate Word document'));
      }
      console.error('Word document generation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      if (!user || !user.name) {
        dispatch(setError('Please sign in to download documents'));
        return;
      }

      if (!research.sections || research.sections.length === 0) {
        dispatch(setError('No research content available'));
        return;
      }

      setIsLoading(true);
      const metadata = {
        title: research.title,
        author: user.name,
        created: new Date()
      };

      const blob = await generatePdfDocument(
        metadata,
        research.sections,
        research.references || []
      );

      downloadDocument(blob, `${research.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } catch (error) {
      if (error instanceof ResearchException) {
        dispatch(setError(error.message));
      } else {
        dispatch(setError('Failed to generate PDF document'));
      }
      console.error('PDF document generation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportButtons = (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Tooltip title={!research.sections.length ? 'Generate research content first' : 'Download as Word document'}>
        <span>
          <Button
            variant="contained"
            onClick={handleDownloadWord}
            disabled={!research.sections.length || isLoading}
            startIcon={<ArticleIcon />}
          >
            Word
          </Button>
        </span>
      </Tooltip>
      <Tooltip title={!research.sections.length ? 'Generate research content first' : 'Download as PDF document'}>
        <span>
          <Button
            variant="contained"
            onClick={handleDownloadPdf}
            disabled={!research.sections.length || isLoading}
            startIcon={<PictureAsPdfIcon />}
          >
            PDF
          </Button>
        </span>
      </Tooltip>
    </Box>
  );

  useEffect(() => {
    // Initialize real-time subscription
    const cleanup = initializeRealtimeSubscription((payload: {
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      new: {
        id: string;
        title: string;
        content: { sections: any[] };
        references: any[];
        created_at: string;
      }
    }) => {
      console.log('Research updated:', payload)
      // Handle real-time updates
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const newData = payload.new
        dispatch(addToHistory({
          id: newData.id,
          title: newData.title,
          content: newData.content.sections,
          references: newData.references,
          timestamp: newData.created_at
        }))
      }
    })

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
          {renderOutlineButton()}
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
              <TextField
                fullWidth
                label="Target Research Topic"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleGenerateTitle}
                  disabled={isLoading}
                >
                  Focus Research Target
                </Button>
                <Button
                  variant="contained"
                  onClick={handleGenerateResearch}
                  disabled={!research.title || isLoading}
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
                      variant="outlined"
                      size="small"
                      autoFocus
                      sx={{ flex: 1 }}
                    />
                    <Tooltip title="Save Target">
                      <IconButton 
                        onClick={handleTitleSave}
                        color="primary"
                        size="small"
                      >
                        <CheckIcon />
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
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            )}

            {/* Research Content Display */}
            {research?.sections && research.sections.length > 0 && (
              <Box>
                <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
                  Research:
                </Typography>
                <Box 
                  id="researchContent" 
                  sx={{ 
                    mt: 2, 
                    p: 3, 
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    overflowX: 'auto',
                    minHeight: '200px',
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    lineHeight: '1.5'
                  }}
                >
                  {research.sections.map((section: ResearchSection, index: number) => {
                    console.log(`Rendering section ${section.number}:`, section);
                    console.log('Subsections:', section.subsections);
                    return (
                      <div key={index}>
                        <Typography 
                          variant="subtitle1" 
                          gutterBottom 
                          sx={{ 
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: 'primary.main',
                            mb: 1
                          }}
                        >
                          {section.number}. {section.title}
                        </Typography>
                        <Typography 
                          variant="body1" 
                          paragraph 
                          sx={{ 
                            fontSize: '13px',
                            whiteSpace: 'pre-wrap',
                            mb: 3
                          }}
                        >
                          {section.content}
                        </Typography>
                        {section.subsections && section.subsections.length > 0 && (
                          <Box sx={{ ml: 3, mb: 3 }}>
                            {section.subsections.map((subsection: ResearchSection, subIndex: number) => (
                              <div key={`${index}-${subIndex}`}>
                                <Typography 
                                  variant="subtitle2" 
                                  gutterBottom 
                                  sx={{ 
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    color: 'primary.main',
                                    mb: 1
                                  }}
                                >
                                  {subsection.number}. {subsection.title}
                                </Typography>
                                <Typography 
                                  variant="body1" 
                                  paragraph 
                                  sx={{ 
                                    fontSize: '13px',
                                    whiteSpace: 'pre-wrap',
                                    mb: 2
                                  }}
                                >
                                  {subsection.content}
                                </Typography>
                              </div>
                            ))}
                          </Box>
                        )}
                      </div>
                    );
                  })}
                  {research?.references && research.references.length > 0 && (
                    <>
                      <Typography 
                        variant="subtitle1" 
                        sx={{ 
                          mt: 4, 
                          mb: 2,
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: 'primary.main'
                        }}
                      >
                        References
                      </Typography>
                      <Box sx={{ ml: 2 }}>
                        {research.references.map((reference, index) => (
                          <Typography 
                            key={index} 
                            paragraph 
                            sx={{ 
                              fontSize: '12px',
                              mb: 1
                            }}
                          >
                            {reference}
                          </Typography>
                        ))}
                      </Box>
                    </>
                  )}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
      <OutlineDialog />
    </Container>
  )
}

export default ResearchPage
