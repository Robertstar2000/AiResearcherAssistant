import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Box } from '@mui/material'
import { useEffect } from 'react'

import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import ResearchPage from './pages/ResearchPage'
import { initializeAuth } from './services/authService'

function App() {
  const location = useLocation()

  useEffect(() => {
    // Initialize auth on mount
    initializeAuth()
    
    // Force redirect to landing page if we're at research page initially
    if (location.pathname === '/research' && !sessionStorage.getItem('visited')) {
      window.location.href = '/'
    }
    sessionStorage.setItem('visited', 'true')
  }, [location])

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="auth" element={<AuthPage />} />
          <Route path="research" element={<ResearchPage />} />
          {/* Catch all route - redirect to landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Box>
  )
}

export default App
