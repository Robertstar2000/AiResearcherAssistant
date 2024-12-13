import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { setUser } from '../store/slices/authSlice'
import { createUser, authenticateUser } from '../services/authService'
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Tab,
  Tabs,
  Alert,
} from '@mui/material'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

export default function AuthPage() {
  const [tab, setTab] = useState(0)
  const [userName, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [occupation, setOccupation] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue)
    setError(null)
  }

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (isLoading) return;

    try {
      if (!email || !password || !userName) {
        throw new Error('Please fill in all required fields')
      }

      setIsLoading(true)
      const user = await createUser({
        email,
        password,
        metadata: {
          name: userName,
          occupation,
          geolocation: location
        }
      })

      dispatch(setUser(user))
      navigate('/research')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    try {
      if (!email || !password) {
        throw new Error('Please fill in all required fields')
      }

      const user = await authenticateUser({
        email,
        password
      })

      dispatch(setUser(user))
      navigate('/research')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log in')
    }
  }

  return (
    <Container component="main" maxWidth="sm">
      <Paper 
        elevation={3} 
        sx={{ 
          mt: 8,
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%)'
        }}
      >
        <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
          {tab === 0 ? 'Sign Up for Free' : 'Welcome Back'}
        </Typography>

        <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 3 }}>
          <Tab label="Sign Up" />
          <Tab label="Login" />
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        <TabPanel value={tab} index={0}>
          <Box component="form" onSubmit={handleSignup} sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Username"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="normal"
              fullWidth
              label="Occupation"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="normal"
              fullWidth
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={isLoading}
              sx={{
                mt: 3,
                mb: 2,
                background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #1976D2 30%, #00BCD4 90%)',
                }
              }}
            >
              {isLoading ? 'Creating Account...' : 'Sign Up'}
            </Button>
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Box component="form" onSubmit={handleLogin} sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              sx={{ mt: 2, mb: 2 }}
            >
              Sign In
            </Button>
          </Box>
        </TabPanel>
      </Paper>
    </Container>
  )
}
