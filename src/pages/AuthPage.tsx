import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Link,
  Alert,
} from '@mui/material'
import { supabase } from '../services/api'
import { setUser, setAuthError } from '../store/slices/authSlice'

const AuthPage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [occupation, setOccupation] = useState('')
  const [geolocation, setGeolocation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        if (data.user) {
          dispatch(setUser({
            id: data.user.id,
            email: data.user.email!,
            name: data.user.user_metadata.name || '',
            occupation: data.user.user_metadata.occupation,
            geolocation: data.user.user_metadata.geolocation,
          }))
          navigate('/research')
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              occupation,
              geolocation,
            },
          },
        })

        if (error) throw error

        if (data.user) {
          dispatch(setUser({
            id: data.user.id,
            email: data.user.email!,
            name,
            occupation,
            geolocation,
          }))
          navigate('/research')
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message)
        dispatch(setAuthError(error.message))
      }
    }
  }

  return (
    <Container component="main" maxWidth="xs">
      <Paper
        elevation={3}
        sx={{
          marginTop: 8,
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          {isLogin ? 'Sign In' : 'Create Account'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
          <Grid container spacing={2}>
            {!isLogin && (
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Grid>
            {!isLogin && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Occupation"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Location"
                    value={geolocation}
                    onChange={(e) => setGeolocation(e.target.value)}
                  />
                </Grid>
              </>
            )}
          </Grid>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            {isLogin ? 'Sign In' : 'Create Account'}
          </Button>

          <Grid container justifyContent="flex-end">
            <Grid item>
              <Link
                component="button"
                variant="body2"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin
                  ? "Don't have an account? Sign Up"
                  : 'Already have an account? Sign In'}
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  )
}

export default AuthPage
