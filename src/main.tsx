import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { AuthProvider } from './features/auth/AuthContext'
import { ThemeProvider } from './features/theme/ThemeContext'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { AppRoot } from './app/AppRoot'
import { takePairRoute } from './features/pairing/pairRoute'

// Read once, before the first render: it wipes a pairing secret from the URL.
const pairRoute = takePairRoute()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <AppRoot initialRoute={pairRoute} />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
