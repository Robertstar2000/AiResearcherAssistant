import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

import App from './App'
import { store } from './store'
import theme from './theme'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

console.log('Starting application...')

const rootElement = document.getElementById('root')
if (!rootElement) {
  console.error('Failed to find the root element')
  throw new Error('Failed to find the root element')
}

console.log('Root element found, creating React root...')
const root = ReactDOM.createRoot(rootElement)

console.log('Rendering application...')
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
          </ThemeProvider>
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
)
