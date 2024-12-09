import { useState } from 'react'
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
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';

const ResearchPage = () => {
  const dispatch = useDispatch()
  const research = useSelector((state: RootState) => state.research)
  const [query, setQuery] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState('');
  const [canExport, setCanExport] = useState(false);

  const updateProgress = (completed: number, total: number, message: string) => {
    setCompletedSteps(completed);
    setTotalSteps(total);
    setProgress((completed / total) * 100);
    setStatusMessage(message);
  };

  const handleModeChange = (event: any) => {
    dispatch(setMode(event.target.value as ResearchMode))
  }

  const handleTypeChange = (event: any) => {
    dispatch(setType(event.target.value as ResearchType))
  }

  const handleCitationStyleChange = (event: any) => {
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
      dispatch(setError('Please generate a title first'))
      return
    }

    if (!research.mode || research.type === undefined) {
      dispatch(setError('Research mode and type are required'))
      return
    }

    setIsLoading(true);
    setCanExport(false); // Disable export buttons at start
    dispatch(setError(null));
    dispatch(setSections([]));
    dispatch(setReferences([]));

    try {
      console.log('Generating research for:', research.title, 'Mode:', research.mode, 'Type:', research.type);
      
      // Generate research content
      const { sections, references, outline } = await generateResearch(
        research.title,
        research.mode,
        research.type,
        research.citationStyle,
        updateProgress
      );

      setOutline(outline); // Store outline for display
      dispatch(setSections(sections));
      dispatch(setReferences(references));
      dispatch(addToHistory({
        id: Date.now().toString(),
        title: research.title,
        content: sections,
        references,
        timestamp: new Date().toISOString()
      }));
      setCanExport(true); // Enable export buttons on success
    } catch (error) {
      console.error('Error in handleGenerateResearch:', error)
      if (error instanceof Error) {
        dispatch(setError(error.message))
      }
      setCanExport(false); // Keep export buttons disabled on error
    } finally {
      setIsLoading(false);
    }
  }

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

  const renderOutlineButton = () => (
    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
      <Tooltip title={outline ? "View Research Outline" : "Generate research to view outline"}>
        <span>
          <IconButton 
            onClick={() => setOutlineOpen(true)}
            disabled={!outline}
            color="primary"
            sx={{ 
              border: '1px solid',
              borderColor: 'primary.main',
              '&:hover': {
                backgroundColor: 'primary.light',
              }
            }}
          >
            <FormatListBulletedIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );

  const OutlineDialog = () => (
    <Dialog
      open={outlineOpen}
      onClose={() => setOutlineOpen(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Research Outline
        <IconButton
          aria-label="close"
          onClick={() => setOutlineOpen(false)}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {outline}
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
      dispatch(setError('Failed to export markup document'));
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
      dispatch(setError('Failed to export PDF document'));
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
      dispatch(setError('Failed to export Word document'));
    }
  };

  const exportButtons = (
    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
      <Button
        variant="contained"
        onClick={handleExportMarkup}
        disabled={!canExport}
        sx={{ 
          backgroundColor: canExport ? 'primary.main' : 'grey.500',
          '&:hover': {
            backgroundColor: canExport ? 'primary.dark' : 'grey.600'
          }
        }}
        startIcon={<DescriptionIcon />}
      >
        Markup
      </Button>
      <Button
        variant="contained"
        onClick={handleExportPDF}
        disabled={!canExport}
        sx={{ 
          backgroundColor: canExport ? 'primary.main' : 'grey.500',
          '&:hover': {
            backgroundColor: canExport ? 'primary.dark' : 'grey.600'
          }
        }}
        startIcon={<PictureAsPdfIcon />}
      >
        PDF
      </Button>
      <Button
        variant="contained"
        onClick={handleExportDOCX}
        disabled={!canExport}
        sx={{ 
          backgroundColor: canExport ? 'primary.main' : 'grey.500',
          '&:hover': {
            backgroundColor: canExport ? 'primary.dark' : 'grey.600'
          }
        }}
        startIcon={<ArticleIcon />}
      >
        Word
      </Button>
    </Box>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Settings Panel */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Research Settings
            </Typography>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Research Mode</InputLabel>
              <Select
                value={research.mode}
                label="Research Mode"
                onChange={handleModeChange}
              >
                <MenuItem value={ResearchMode.Basic}>Basic</MenuItem>
                <MenuItem value={ResearchMode.Advanced}>Advanced</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Research Type</InputLabel>
              <Select
                value={research.type}
                label="Research Type"
                onChange={handleTypeChange}
              >
                <MenuItem value={ResearchType.Article}>Article</MenuItem>
                <MenuItem value={ResearchType.General}>General Research</MenuItem>
                <MenuItem value={ResearchType.Literature}>Literature Review</MenuItem>
                <MenuItem value={ResearchType.Experiment}>Experiment Design</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Citation Style</InputLabel>
              <Select
                value={research.citationStyle}
                label="Citation Style"
                onChange={handleCitationStyleChange}
              >
                <MenuItem value={CitationStyle.APA}>APA</MenuItem>
                <MenuItem value={CitationStyle.MLA}>MLA</MenuItem>
                <MenuItem value={CitationStyle.Chicago}>Chicago</MenuItem>
                <MenuItem value={CitationStyle.Harvard}>Harvard</MenuItem>
              </Select>
            </FormControl>
          </Paper>
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

            {research.loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <CircularProgress size={20} />
              </Box>
            )}

            {isLoading && (
              <Box sx={{ width: '100%', mt: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {statusMessage}
                  </Typography>
                  <Typography variant="body2" sx={{ ml: 2 }}>
                    {Math.round(progress)}%
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ width: '100%', mr: 1 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={progress} 
                      sx={{ 
                        height: 8,
                        borderRadius: 4,
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 4,
                        }
                      }}
                    />
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                  {`Processing section ${completedSteps + 1} of ${totalSteps}`}
                </Typography>
              </Box>
            )}

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
                  {research.sections.map((section, index) => {
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
                            color: 'primary.main'
                          }}
                        >
                          {section.number}. {section.title}
                        </Typography>
                        {section.content && (
                          <Typography 
                            paragraph 
                            sx={{ 
                              ml: 2,
                              fontSize: '13px',
                              mb: 2
                            }}
                          >
                            {section.content}
                          </Typography>
                        )}
                        {section.subsections && section.subsections.length > 0 && (
                          <Box sx={{ ml: 3, mb: 3 }}>
                            {section.subsections.map((subsection, subIndex) => {
                              console.log(`Rendering subsection ${subsection.number}:`, subsection);
                              return (
                                <div key={`${index}-${subIndex}`}>
                                  <Typography 
                                    variant="subtitle2" 
                                    gutterBottom 
                                    sx={{ 
                                      fontSize: '13px',
                                      fontWeight: 'bold',
                                      color: 'text.secondary',
                                      mt: 1
                                    }}
                                  >
                                    {subsection.number} {subsection.title}
                                  </Typography>
                                  <Typography 
                                    paragraph 
                                    sx={{ 
                                      ml: 2,
                                      fontSize: '12px',
                                      mb: 2
                                    }}
                                  >
                                    {subsection.content}
                                  </Typography>
                                </div>
                              );
                            })}
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
