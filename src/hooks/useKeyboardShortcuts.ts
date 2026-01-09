import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutConfig {
  onSearch?: () => void;
  onExport?: () => void;
}

export function useKeyboardShortcuts({ onSearch, onExport }: ShortcutConfig = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // "/" for search
      if (e.key === '/' && onSearch) {
        e.preventDefault();
        onSearch();
      }

      // "n" for new project
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigate('/project/new');
      }

      // "e" for export
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey && onExport) {
        e.preventDefault();
        onExport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, onSearch, onExport]);
}
