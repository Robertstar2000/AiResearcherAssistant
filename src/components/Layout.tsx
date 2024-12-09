import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, AppBar, Toolbar, Typography, Container, Button, IconButton } from '@mui/material'
import { Menu as MenuIcon, ExitToApp as ExitToAppIcon } from '@mui/icons-material'
import { useSelector } from 'react-redux'
import { RootState } from '../store'
import { signOut } from '../services/authService'
import { AuthUser } from '../store/slices/authSlice'

const Layout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated)
  const user = useSelector((state: RootState) => state.auth.user) as AuthUser | null

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="primary" elevation={2}>
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            AI Researcher
          </Typography>
          {isAuthenticated ? (
            <>
              <Typography variant="body1" sx={{ mr: 2 }}>
                {user?.email}
              </Typography>
              <IconButton color="inherit" onClick={handleLogout}>
                <ExitToAppIcon />
              </IconButton>
            </>
          ) : (
            location.pathname !== '/auth' && (
              <Button color="inherit" onClick={() => navigate('/auth')}>
                Login
              </Button>
            )
          )}
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ flex: 1, py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  )
}

export default Layout
