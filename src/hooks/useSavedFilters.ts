import { useState, useCallback } from 'react';

export interface SavedFilter {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: Date;
}

export interface FilterState {
  statusFilters: string[];
  tradeFilters: string[];
  searchQuery: string;
  priceMin: number | null;
  priceMax: number | null;
  varianceRange: string;
  quickFilters: string[];
}

const STORAGE_KEY = 'cost-insight-saved-filters';

export function useSavedFilters() {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((f: SavedFilter) => ({
          ...f,
          createdAt: new Date(f.createdAt),
        }));
      }
    } catch (e) {
      console.error('Failed to load saved filters:', e);
    }
    return [];
  });

  const saveFilter = useCallback((name: string, filters: FilterState) => {
    const newFilter: SavedFilter = {
      id: crypto.randomUUID(),
      name,
      filters,
      createdAt: new Date(),
    };

    setSavedFilters((prev) => {
      const updated = [...prev, newFilter];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    return newFilter;
  }, []);

  const deleteFilter = useCallback((id: string) => {
    setSavedFilters((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getDefaultFilterState = (): FilterState => ({
    statusFilters: [],
    tradeFilters: [],
    searchQuery: '',
    priceMin: null,
    priceMax: null,
    varianceRange: 'all',
    quickFilters: [],
  });

  return {
    savedFilters,
    saveFilter,
    deleteFilter,
    getDefaultFilterState,
  };
}
