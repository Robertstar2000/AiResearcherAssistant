import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import {
  Box,
  Typography,
  Container,
  Grid,
  Paper,
  Button
} from '@mui/material'
import {
  Search as SearchIcon,
  AutoStories as AutoStoriesIcon,
  MenuBook as MenuBookIcon,
  FormatQuote as FormatQuoteIcon,
  Person as PersonIcon
} from '@mui/icons-material'
import Picture5 from '../assets/Picture5.png'

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
}

const features: Feature[] = [
  {
    icon: <SearchIcon fontSize="large" />,
    title: 'Research Modes',
    description: 'Choose between Basic mode for clear, accessible explanations, or Advanced mode for comprehensive technical analysis.',
    details: [
      'Basic: Clear, focused explanations of core concepts',
      'Advanced: In-depth technical analysis and detailed methodology'
    ]
  },
  {
    icon: <AutoStoriesIcon fontSize="large" />,
    title: 'Research Types',
    description: 'Select from multiple research formats tailored to your specific needs.',
    details: [
      'Academic Articles: Professional research paper format',
      'Literature Reviews: Comprehensive analysis of existing research',
      'General Research: Well-structured topic exploration',
      'Experiment Design: Detailed methodology planning'
    ]
  },
  {
    icon: <FormatQuoteIcon fontSize="large" />,
    title: 'Citation Styles',
    description: 'Professional citations formatted in your preferred academic style.',
    details: [
      'APA: American Psychological Association format',
      'MLA: Modern Language Association style',
      'Chicago: Chicago Manual of Style',
      'IEEE: Institute of Electrical and Electronics Engineers format'
    ]
  },
  {
    icon: <MenuBookIcon fontSize="large" />,
    title: 'Content Generation',
    description: 'AI-powered research content generation with structured, academically rigorous sections.',
    details: [
      'Intelligent section organization',
      'Comprehensive references',
      'Clear methodology frameworks',
      'Detailed results analysis'
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
        </Typography>
        <Typography 
          variant="subtitle1" 
          sx={{ 
            maxWidth: '800px', 
            mx: 'auto', 
            mb: 3, 
            fontSize: { xs: '0.9rem', md: '1rem' },
            whiteSpace: 'pre-line'
          }}
        >
          Developed by MIFECO
          (an affiliate of the Mars Technology Institute)
          to advance human research capabilities
          for the benefit of humanity on Earth and Mars.
        </Typography>
        <Button
          variant="contained"
          color="secondary"
          size="large"
          onClick={() => navigate('/auth')}
          sx={{ 
            px: 6,
            py: 2,
            mb: 4,
            fontSize: '1.25rem',
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #FF4081 30%, #FF8E53 90%)',
            boxShadow: '0 3px 5px 2px rgba(255, 105, 135, .3)',
            '&:hover': {
              background: 'linear-gradient(45deg, #FF4081 10%, #FF8E53 70%)',
              transform: 'scale(1.05)',
              transition: 'transform 0.2s'
            }
          }}
        >
          Sign Up For Free
        </Button>
      </Box>

      {/* Features Grid */}
      <Grid container spacing={4} sx={{ mb: 6 }}>
        {features.map((feature, index) => (
          <Grid item xs={12} md={6} key={index}>
            <Paper
              sx={{
                p: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%)',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  transition: 'transform 0.3s ease-in-out',
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {feature.icon}
                <Typography variant="h6" component="h3" sx={{ ml: 1 }}>
                  {feature.title}
                </Typography>
              </Box>
              <Typography color="text.secondary" paragraph>
                {feature.description}
              </Typography>
              <Box component="ul" sx={{ mt: 'auto', pl: 2 }}>
                {feature.details.map((detail, idx) => (
                  <Typography component="li" key={idx} sx={{ mb: 0.5 }}>
                    {detail}
                  </Typography>
                ))}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* AI Scientists Inspiration Section */}
      <Paper sx={{ p: 3, mb: 6, background: 'linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)' }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1, textAlign: 'center' }}>
          Inspired by Leading AI Scientists
        </Typography>
        <Typography variant="body2" sx={{ textAlign: 'center', mb: 2 }}>
          Built upon the groundbreaking work of the AI-Scientist project authors:
        </Typography>
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          gap: 1,
          px: 2
        }}>
          {[
            "Chris Lu - Large language models",
            "Cong Lu - AI research methodology",
            "Robert Tjarko Lange - AI learning",
            "Jakob Foerster - AI cooperation",
            "Jeff Clune - AI systems evolution",
            "David Ha - AI architectures"
          ].map((scientist, index) => (
            <Box key={index} sx={{ 
              display: 'flex', 
              alignItems: 'center',
              py: 0.5,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' }
            }}>
              <PersonIcon sx={{ mr: 1, color: 'primary.main', fontSize: '1rem' }} />
              <Typography variant="body2">{scientist}</Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
          Learn more about their work at{' '}
          <a href="https://github.com/SakanaAI/AI-Scientist" target="_blank" rel="noopener noreferrer">
            github.com/SakanaAI/AI-Scientist
          </a>
        </Typography>
      </Paper>
    </Container>
  )
}

export default LandingPage
