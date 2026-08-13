import { createContext, useContext, useState, useCallback } from 'react';

const LoadingContext = createContext(null);

export function LoadingProvider({ children }) {
  const [isInitializing, setIsInitializing] = useState(true);

  console.log('[LoadingProvider] isInitializing:', isInitializing);

  const completeInitialization = useCallback(() => {
    console.log('[LoadingProvider] completeInitialization called');
    setIsInitializing(false);
  }, []);

  const value = {
    isInitializing,
    completeInitialization,
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within LoadingProvider');
  }
  return context;
}
