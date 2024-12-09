import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, AppBar, Toolbar, Typography, Container, Button, IconButton } from '@mui/material'
import { Menu as MenuIcon, ExitToApp as ExitToAppIcon } from '@mui/icons-material'
import { useSelector } from 'react-redux'
import { RootState } from '../store'
import { signOut } from '../services/authService'

const Layout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated)
  const user = useSelector((state: RootState) => state.auth.user)

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
          
          <Typography 
            variant="h6" 
            component="div" 
            sx={{ 
              flexGrow: 1, 
              cursor: 'pointer',
              fontWeight: 'bold',
              letterSpacing: '0.5px'
            }}
            onClick={() => navigate('/')}
          >
            AI Researcher
          </Typography>

          {location.pathname !== '/auth' && !isAuthenticated && (
            <Button 
              color="inherit" 
              onClick={() => navigate('/auth')}
              sx={{ textTransform: 'none' }}
            >
              Sign In
            </Button>
          )}

          {isAuthenticated && (
            <>
              <Typography variant="body1" sx={{ mr: 2 }}>
                {user?.name || user?.email}
              </Typography>
              <IconButton color="inherit" onClick={handleLogout}>
                <ExitToAppIcon />
              </IconButton>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Container component="main" sx={{ flexGrow: 1, py: 3 }}>
        <Outlet />
      </Container>

      <Box 
        component="footer" 
        sx={{ 
          py: 3, 
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            {new Date().getFullYear()} AI Researcher. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  )
}

export default Layout
