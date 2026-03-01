import { useState, useCallback } from 'react';

const STORAGE_KEY = 'unitrate-export-preferences';

export interface ExportPreferences {
  includeDescription: boolean;
  includeTrade: boolean;
  includeQuantity: boolean;
  includeUnit: boolean;
  includeOriginalPrice: boolean;
  includeOriginalTotal: boolean;
  includeRecommendedPrice: boolean;
  includeRecommendedTotal: boolean;
  includeBenchmarks: boolean;
  includeVariance: boolean;
  includeStatus: boolean;
  includeAIComments: boolean;
  onlyFlagged: boolean;
  currencyFormat: 'symbol' | 'code' | 'none';
  pdfFormat: 'executive' | 'full';
  exportType: 'excel' | 'pdf';
  // Cover page fields
  clientName: string;
  contractorName: string;
  coverNotes: string;
  // Trade filter
  excludedTrades: string[];
}

const DEFAULTS: ExportPreferences = {
  includeDescription: true,
  includeTrade: true,
  includeQuantity: true,
  includeUnit: true,
  includeOriginalPrice: true,
  includeOriginalTotal: true,
  includeRecommendedPrice: true,
  includeRecommendedTotal: true,
  includeBenchmarks: false,
  includeVariance: true,
  includeStatus: true,
  includeAIComments: false,
  onlyFlagged: false,
  currencyFormat: 'code',
  pdfFormat: 'executive',
  exportType: 'pdf',
  clientName: '',
  contractorName: '',
  coverNotes: '',
  excludedTrades: [],
};

function loadPreferences(): ExportPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULTS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULTS;
}

export function useExportPreferences() {
  const [preferences, setPreferences] = useState<ExportPreferences>(loadPreferences);

  const updatePreference = useCallback(<K extends keyof ExportPreferences>(
    key: K,
    value: ExportPreferences[K]
  ) => {
    setPreferences(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULTS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { preferences, updatePreference, resetPreferences };
}
