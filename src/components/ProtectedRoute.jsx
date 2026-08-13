import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingScreen from './LoadingScreen.jsx';

// Redirects signed-in users away from auth pages.
export function RedirectIfAuthed({ children }) {
  const { isAuthenticated, initializing } = useAuth();
  if (initializing) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

// Protect private pages; requires an authenticated user with a Firestore profile.
export function ProtectedRoute({ children }) {
  const { isAuthenticated, initializing, profile, profileLoading } = useAuth();
  const location = useLocation();

  if (initializing) return <LoadingScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  // No profile yet → require registration completion (username setup).
  if (!profileLoading && !profile) {
    return <Navigate to="/login" state={{ from: location.pathname, needsProfile: true }} replace />;
  }
  return children;
}
