import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { setUser } from '../store/slices/authSlice'
import { createUser, authenticateUser } from '../services/databaseService'
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
  const [password, setPassword] = useState('')
  const [occupation, setOccupation] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue)
    setError(null)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const user = await authenticateUser(userName, password)
      if (user) {
        dispatch(setUser(user))
        navigate('/research')
      } else {
        setError('Invalid username or password')
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('Failed to log in. Please try again.')
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const userData = {
        'User-Name': userName,
        'PassWord': password,
        'Occupation': occupation,
        'Location': location,
        title: '',
        content: '',
        references: ''
      }
      
      const newUser = await createUser(userData)
      dispatch(setUser(newUser))
      navigate('/research')
    } catch (error) {
      console.error('Signup error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create account. Please try again.')
    }
  }

  return (
    <Container component="main" maxWidth="sm">
      <Paper elevation={6} sx={{ mt: 8, p: 4 }}>
        <Typography component="h1" variant="h5" align="center" gutterBottom>
          AI Researcher Assistant
        </Typography>
        
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={tab} onChange={handleTabChange} centered>
            <Tab label="Login" />
            <Tab label="Sign Up" />
          </Tabs>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TabPanel value={tab} index={0}>
          <form onSubmit={handleLogin}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Username"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Login
            </Button>
          </form>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <form onSubmit={handleSignup}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Username"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Occupation"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Sign Up
            </Button>
          </form>
        </TabPanel>
      </Paper>
    </Container>
  )
}
