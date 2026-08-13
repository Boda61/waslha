import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import { LoadingProvider } from './contexts/LoadingContext.jsx'
import CinematicLoader from './components/CinematicLoader.jsx'

function Root() {
  return (
    <LoadingProvider>
      <CinematicLoader />
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </LoadingProvider>
  );
}

const rootElement = document.getElementById('root');
createRoot(rootElement).render(<Root />)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Cleanup on HMR
  })
}

