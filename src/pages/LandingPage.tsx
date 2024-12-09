import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import {
  Box,
  Button,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  TextField,
  Divider,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  AlertTitle,
} from '@mui/material'
import {
  Search as SearchIcon,
  AutoStories as AutoStoriesIcon,
  Science as ScienceIcon,
  Description as DescriptionIcon,
  School as SchoolIcon,
  FormatQuote as FormatQuoteIcon,
  Psychology as PsychologyIcon,
  MenuBook as MenuBookIcon,
  RocketLaunch as RocketLaunchIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material'
// @ts-ignore
import Picture5 from '../assets/Picture5.png'

const features = [
  {
    icon: <SearchIcon fontSize="large" />,
    title: 'Research Modes',
    description: 'Choose between Basic mode for clear, accessible explanations, or Advanced mode for in-depth technical analysis.',
    details: [
      'Basic: Focus on main concepts and clear explanations',
      'Advanced: Detailed technical information and thorough analysis'
    ]
  },
  {
    icon: <AutoStoriesIcon fontSize="large" />,
    title: 'Research Types',
    description: 'Select from multiple research formats to suit your needs.',
    details: [
      'Article: Traditional research paper format',
      'Literature Review: Comprehensive analysis of existing research',
      'General Research: Well-rounded topic exploration',
      'Experiment Design: Detailed methodology planning'
    ]
  },
  {
    icon: <FormatQuoteIcon fontSize="large" />,
    title: 'Citation Styles',
    description: 'Professional citations in your preferred academic format.',
    details: [
      'APA: American Psychological Association style',
      'Web: Digital-first citation format',
      'Informal: Simplified reference style'
    ]
  },
  {
    icon: <MenuBookIcon fontSize="large" />,
    title: 'Content Generation',
    description: 'AI-powered research content generation with structured sections.',
    details: [
      'Automatic section organization',
      'Referenced content',
      'Clear methodology',
      'Results analysis'
    ]
  }
]

const LandingPage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'R' && event.shiftKey) {
        navigate('/research')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 8 }}>
      {/* Hero Section */}
      <Box sx={{ 
        textAlign: 'center', 
        py: 2,
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        borderRadius: 4,
        color: 'white',
        mb: 3 
      }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          mb: 2,
          height: '160px'
        }}>
          <img 
            src={Picture5}
            alt="Mars Technology Institute Logo" 
            style={{ 
              height: '160px',
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.2))'
            }}
          />
        </Box>
        <Typography 
          variant="h2" 
          component="h1" 
          sx={{ 
            fontSize: { xs: '2rem', md: '2.5rem' },
            mb: 1,
            whiteSpace: 'pre-line'
          }}
        >
          AI Research Assistant
          <br/>
        </Typography>
        <Typography 
          variant="h5" 
          sx={{ 
            mb: 1, 
            fontSize: { xs: '1.2rem', md: '1.5rem' },
            whiteSpace: 'pre-line'
          }}
        >
          Advanced AI-Powered Research Generation
          <br/>
        </Typography>
        <Typography 
          variant="subtitle1" 
          sx={{ 
            maxWidth: '800px', 
            mx: 'auto', 
            mb: 1, 
            fontSize: { xs: '0.9rem', md: '1rem' },
            whiteSpace: 'pre-line'
          }}
        >
          Developed by MIFECO
          <br/>
          (an affiliate of the Mars Technology Institute)
          <br/>
          to enhance human research for the
          <br/>
          benefit of humanity on Earth and in the near future Mars.
        </Typography>

      </Box>

      {/* Features Grid */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {features.map((feature, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Paper 
              elevation={2} 
              sx={{ 
                p: 2, 
                height: '100%',
                backgroundColor: 'rgba(30, 60, 114, 0.03)',
                '&:hover': {
                  backgroundColor: 'rgba(30, 60, 114, 0.06)',
                  transform: 'translateY(-2px)',
                  transition: 'all 0.2s'
                }
              }}
            >
              <ListItem disablePadding sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 'auto', mb: 1, color: 'primary.main' }}>
                  {feature.icon}
                </ListItemIcon>
                <Typography variant="subtitle1" sx={{ mb: 1, fontSize: '0.9rem', fontWeight: 'bold' }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {feature.description}
                </Typography>
              </ListItem>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* MTI Affiliation Section */}
      <Paper elevation={3} sx={{ p: 4, mb: 3, background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color: 'white' }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12}>
            <Typography variant="h4" gutterBottom>
              Mars Technology Institute Affiliation
            </Typography>
            <Typography variant="body1" paragraph>
              As an official project of the Mars Technology Institute (MTI), this AI Research Assistant 
              represents our commitment to advancing human knowledge both on Earth and in future Mars colonies.
            </Typography>
            <Typography variant="body1">
              Version 1.02 - Available for MTI advisory group limited distribution.
              For support or feedback, contact: rmills@MIFECO.com
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Important Notice */}
      <Alert severity="info" sx={{ mb: 4 }}>
        <AlertTitle>Important Notice</AlertTitle>
        <Typography variant="body2">
          This AI assistant is provided to enhance your research capabilities. While powerful, 
          it's important to verify all generated content. AIs can be subject to errors or 
          hallucinations. Always review and validate the output before use.
        </Typography>
      </Alert>

      {/* Copyright Footer */}
      <Box sx={{ textAlign: 'center', mt: 4, color: 'text.secondary', fontSize: '0.875rem' }}>
        <Typography variant="body2" color="text.secondary">
          2024 MIFECO in affiliation with the Mars Technology Institute. All rights reserved.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Planned enhancements: Stronger reasoning, expanded research types, and enhanced accuracy.
        </Typography>
      </Box>
    </Container>
  );
};

export default LandingPage
