import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

type ViewMode = 'admin' | 'user';

const STORAGE_KEY = 'viewMode';

export function useViewMode() {
  const { isAdmin } = useAuth();
  const [viewMode, setViewModeState] = useState<ViewMode>('admin');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize view mode from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (stored && (stored === 'admin' || stored === 'user')) {
      setViewModeState(stored);
    }
    setIsInitialized(true);
  }, []);

  // Set view mode and persist to localStorage
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  // Toggle between admin and user view
  const toggleViewMode = useCallback(() => {
    const newMode = viewMode === 'admin' ? 'user' : 'admin';
    setViewMode(newMode);
  }, [viewMode, setViewMode]);

  // The effective view mode:
  // - If user is not an actual admin, always return 'user' (security)
  // - If admin is in preview mode, return 'user'
  // - Otherwise return 'admin'
  const effectiveViewMode: ViewMode = isAdmin ? viewMode : 'user';
  
  // Whether we're currently showing the user preview (admin pretending to be user)
  const isUserPreview = isAdmin && viewMode === 'user';
  
  // Whether to show admin-only UI features
  // This combines actual admin status with view mode preference
  const showAsAdmin = isAdmin && viewMode === 'admin';

  return {
    viewMode,
    effectiveViewMode,
    isUserPreview,
    showAsAdmin,
    setViewMode,
    toggleViewMode,
    isInitialized,
    // Convenience: is the current user actually an admin (regardless of view mode)
    isActualAdmin: isAdmin,
  };
}
