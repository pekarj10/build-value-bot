import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useAuth } from './useAuth';

type ViewMode = 'admin' | 'user';

const STORAGE_KEY = 'unitrate_viewMode';

// Create a simple pub/sub for view mode changes
const viewModeListeners = new Set<() => void>();

function notifyViewModeChange() {
  viewModeListeners.forEach(listener => listener());
}

function getViewModeSnapshot(): ViewMode {
  if (typeof window === 'undefined') return 'admin';
  const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
  if (stored && (stored === 'admin' || stored === 'user')) {
    return stored;
  }
  return 'admin';
}

function subscribeToViewMode(callback: () => void) {
  viewModeListeners.add(callback);
  return () => viewModeListeners.delete(callback);
}

export function useViewMode() {
  const { isAdmin } = useAuth();
  
  // Use useSyncExternalStore for reliable reactivity across components
  const viewMode = useSyncExternalStore(
    subscribeToViewMode,
    getViewModeSnapshot,
    () => 'admin' as ViewMode // Server snapshot
  );

  // Set view mode and persist to localStorage
  const setViewMode = useCallback((mode: ViewMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    notifyViewModeChange();
  }, []);

  // Toggle between admin and user view
  const toggleViewMode = useCallback(() => {
    const current = getViewModeSnapshot();
    const newMode = current === 'admin' ? 'user' : 'admin';
    setViewMode(newMode);
  }, [setViewMode]);

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
    // Convenience: is the current user actually an admin (regardless of view mode)
    isActualAdmin: isAdmin,
  };
}
