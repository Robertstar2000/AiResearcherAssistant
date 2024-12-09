import { Component, ErrorInfo, ReactNode } from 'react'
import { Box, Typography, Button } from '@mui/material'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    })
    
    // Log error to your preferred logging service
    console.error('Error:', error)
    console.error('Error Info:', errorInfo)
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom>
            Oops! Something went wrong
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            We apologize for the inconvenience. Please try refreshing the page or contact support if the problem persists.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={this.handleReset}
            sx={{ mt: 2 }}
          >
            Try Again
          </Button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Box sx={{ mt: 4, textAlign: 'left' }}>
              <Typography variant="h6" gutterBottom>
                Error Details:
              </Typography>
              <pre style={{ overflow: 'auto', maxWidth: '100%' }}>
                {this.state.error.toString()}
              </pre>
              {this.state.errorInfo && (
                <pre style={{ overflow: 'auto', maxWidth: '100%' }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </Box>
          )}
        </Box>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
