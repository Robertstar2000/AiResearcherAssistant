import { Routes, Route, Navigate } from 'react-router-dom'
import { Box } from '@mui/material'
import { useEffect } from 'react'

import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import ResearchPage from './pages/ResearchPage'
import { initializeAuth } from './services/authService'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  useEffect(() => {
    console.log('Starting auth initialization...');
    initializeAuth()
      .then(() => {
        console.log('Auth initialization completed successfully');
      })
      .catch((error) => {
        console.error('Auth initialization failed:', error);
      });
  }, []);

  return (
    <ErrorBoundary>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="auth" element={<AuthPage />} />
            <Route path="research" element={<ResearchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Box>
    </ErrorBoundary>
  )
}

export default App
