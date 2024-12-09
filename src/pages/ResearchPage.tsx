import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material'
import {
  ResearchMode,
  ResearchType,
  CitationStyle,
  ResearchSection,
  setTitle,
  setMode,
  setType,
  setCitationStyle,
  setLoading,
  setError,
  setSections,
  setReferences,
  addToHistory,
} from '../store/slices/researchSlice'
import { RootState } from '../store'
import { generateTitle, generateDetailedOutline } from '../services/api'
import { generateResearch } from '../services/researchService'
import { generateMarkup, generatePDF, generateDOCX, downloadDocument } from '../services/documentService';
import { saveResearchEntry, initializeRealtimeSubscription } from '../services/databaseService'
import { ResearchError, ResearchException } from '../services/researchErrors';
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';

interface Section {
  number: string;
  title: string;
  content: string;
  subsections?: Section[];
}

interface ProgressUpdate {
  completed: number;
  total: number;
  message: string;
}

const ResearchPage = () => {
  const dispatch = useDispatch()
  const research = useSelector((state: RootState) => state.research)
  const user = useSelector((state: RootState) => state.auth.user)
  const [query, setQuery] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<number>(0)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [totalSteps, setTotalSteps] = useState<number>(0)
  const [completedSteps, setCompletedSteps] = useState<number>(0)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outline, setOutline] = useState('')
  const [canExport, setCanExport] = useState(false)

  const updateProgress = ({ completed, total, message }: ProgressUpdate): void => {
    setCompletedSteps(completed)
    setTotalSteps(total)
    setProgress((completed / total) * 100)
    setStatusMessage(message)
  }

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setMode(event.target.value as ResearchMode))
  }

  const handleTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setType(event.target.value as ResearchType))
  }

  const handleCitationStyleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setCitationStyle(event.target.value as CitationStyle))
  }

  const handleGenerateTitle = async () => {
    if (!query.trim()) {
      dispatch(setError('Please enter a research query'))
      return
    }

    // Clear previous research content when generating new title
    dispatch(setSections([]));
    dispatch(setReferences([]));
    dispatch(setLoading(true))
    dispatch(setError(null))

    try {
      const generatedTitle = await generateTitle(query)
      dispatch(setTitle(generatedTitle))
    } catch (error) {
      if (error instanceof Error) {
        dispatch(setError(error.message))
      }
    } finally {
      dispatch(setLoading(false))
      setCanExport(false);
    }
  }

  const handleGenerateResearch = async () => {
    if (!research.title) {
      dispatch(setError('Please generate a title first'));
      return;
    }

    if (!research.mode || research.type === undefined) {
      dispatch(setError('Research mode and type are required'));
      return;
    }

    setIsLoading(true);
    setCanExport(false);
    dispatch(setError(null));
    dispatch(setSections([]));
    dispatch(setReferences([]));
    
    // Set initial progress to 3%
    updateProgress({ completed: 3, total: 100, message: 'Initializing research generation...' });

    try {
      console.log('Generating research for:', research.title, 'Mode:', research.mode, 'Type:', research.type);
      
      const { sections, references, outline } = await generateResearch(
        research.title,
        research.mode,
        research.type,
        research.citationStyle,
        updateProgress
      );

      setOutline(outline);
      dispatch(setSections(sections));
      dispatch(setReferences(references));

      try {
        if (!user?.id) {
          throw new Error('User must be logged in to save research');
        }

        const result = await saveResearchEntry({
          userId: user.id,
          title: research.title,
          content: {
            sections: sections.map(section => ({
              title: section.title,
              content: section.content,
              number: section.number,
              subsections: section.subsections
            }))
          },
          references,
          created_at: new Date().toISOString()
        });

        dispatch(addToHistory({
          id: result.id,
          title: research.title,
          content: sections,
          references,
          timestamp: new Date().toISOString()
        }));

        setCanExport(true);
      } catch (error) {
        console.error('Error saving research:', error);
        dispatch(setError(error instanceof Error ? error.message : 'Failed to save research'));
      }
    } catch (error) {
      console.error('Error in handleGenerateResearch:', error);
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      if (error instanceof ResearchException) {
        switch (error.type) {
          case ResearchError.TOKEN_LIMIT_EXCEEDED:
            errorMessage = 'The research content is too long. Please try a shorter query or use Basic mode.';
            break;
          case ResearchError.API_ERROR:
            errorMessage = 'Failed to communicate with the research service. Please try again.';
            break;
          case ResearchError.VALIDATION_FAILED:
            errorMessage = 'Research validation failed. Please check your input and try again.';
            break;
          case ResearchError.TIMEOUT_ERROR:
            errorMessage = 'The request timed out. Please try again.';
            break;
          default:
            errorMessage = error.message || 'An error occurred while generating research.';
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      dispatch(setError(errorMessage));
      setCanExport(false);
    } finally {
      setIsLoading(false);
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
              {statusMessage}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {Math.round(progress)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={progress} 
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
        <Select<ResearchType>
          value={research.type}
          label="Type"
          onChange={(e) => handleTypeChange(e as React.ChangeEvent<HTMLInputElement>)}
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

  const handleExportMarkup = async () => {
    try {
      const metadata = {
        title: research.title,
        author: 'Generated by AI Researcher', // You can customize this
        date: new Date().toLocaleDateString()
      };
      const markup = await generateMarkup(metadata, research.sections, research.references);
      const blob = new Blob([markup], { type: 'text/html' });
      downloadDocument(blob, `${research.title.replace(/\s+/g, '_')}.html`);
    } catch (error) {
      console.error('Error exporting markup:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Failed to export markup document'));
    }
  };

  const handleExportPDF = async () => {
    try {
      const metadata = {
        title: research.title,
        author: 'Generated by AI Researcher',
        date: new Date().toLocaleDateString()
      };
      const pdfBlob = await generatePDF(metadata, research.sections, research.references);
      downloadDocument(pdfBlob, `${research.title.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Failed to export PDF document'));
    }
  };

  const handleExportDOCX = async () => {
    try {
      const metadata = {
        title: research.title,
        author: 'Generated by AI Researcher',
        date: new Date().toLocaleDateString()
      };
      const docxBlob = await generateDOCX(metadata, research.sections, research.references);
      downloadDocument(docxBlob, `${research.title.replace(/\s+/g, '_')}.docx`);
    } catch (error) {
      console.error('Error exporting DOCX:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Failed to export Word document'));
    }
  };

  const exportButtons = (
    <Box sx={{ display: 'flex', gap: 2, mt: 2, mb: 2 }}>
      <Button
        variant="contained"
        onClick={handleExportMarkup}
        disabled={!canExport}
        startIcon={<DescriptionIcon />}
        sx={{ 
          backgroundColor: canExport ? 'primary.main' : 'grey.500',
          '&:hover': {
            backgroundColor: canExport ? 'primary.dark' : 'grey.600'
          },
          '&.Mui-disabled': {
            backgroundColor: 'grey.300',
            color: 'grey.500'
          }
        }}
      >
        Markup
      </Button>
      <Button
        variant="contained"
        onClick={handleExportPDF}
        disabled={!canExport}
        startIcon={<PictureAsPdfIcon />}
        sx={{ 
          backgroundColor: canExport ? 'primary.main' : 'grey.500',
          '&:hover': {
            backgroundColor: canExport ? 'primary.dark' : 'grey.600'
          },
          '&.Mui-disabled': {
            backgroundColor: 'grey.300',
            color: 'grey.500'
          }
        }}
      >
        PDF
      </Button>
      <Button
        variant="contained"
        onClick={handleExportDOCX}
        disabled={!canExport}
        startIcon={<ArticleIcon />}
        sx={{ 
          backgroundColor: canExport ? 'primary.main' : 'grey.500',
          '&:hover': {
            backgroundColor: canExport ? 'primary.dark' : 'grey.600'
          },
          '&.Mui-disabled': {
            backgroundColor: 'grey.300',
            color: 'grey.500'
          }
        }}
      >
        Word
      </Button>
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
                  {research.sections.map((section: Section, index: number) => {
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
                            {section.subsections.map((subsection: Section, subIndex: number) => (
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
