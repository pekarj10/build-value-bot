export type ProjectStatus = 'draft' | 'processing' | 'ready' | 'exported';

export type ProjectType = 
  | 'new_construction_residential'
  | 'new_construction_hotel'
  | 'new_construction_industrial'
  | 'new_construction_retail'
  | 'new_construction_office'
  | 'reconstruction'
  | 'demolition'
  | 'office_fitout'
  | 'personal_renovation';

export type CostItemStatus = 'ok' | 'review' | 'clarification' | 'underpriced' | 'actual';

export interface Project {
  id: string;
  name: string;
  country: string;
  currency: string;
  projectType: ProjectType;
  notes?: string;
  projectNotes?: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  totalItems?: number;
  totalValue?: number;
  issuesCount?: number;
  userId?: string;
  isShared?: boolean;
  sharedRole?: 'viewer' | 'editor' | 'admin';
}

export interface CostItem {
  id: string;
  projectId: string;
  sheetName?: string;
  trade?: string;
  originalDescription: string;
  interpretedScope: string;
  quantity: number;
  unit: string;
  originalUnitPrice?: number;
  recommendedUnitPrice: number | null;
  benchmarkMin: number | null;
  benchmarkTypical: number | null;
  benchmarkMax: number | null;
  totalPrice: number;
  status: CostItemStatus;
  aiComment: string;
  clarificationQuestion?: string;
  userClarification?: string;
  userOverridePrice?: number;
  // Benchmark matching fields
  matchedBenchmarkId?: string | null;
  matchConfidence?: number | null;
  matchReasoning?: string | null;
  priceSource?: string | null;
  userExplanation?: string | null;
  // Audit trail fields
  lastModifiedBy?: string | null;
  lastModifiedAt?: string | null;
  mutationCount?: number;
}

export interface ProjectInsight {
  title: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
}

export interface ProcessingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  message?: string;
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  new_construction_residential: 'New Construction - Residential',
  new_construction_hotel: 'New Construction - Hotel',
  new_construction_industrial: 'New Construction - Industrial',
  new_construction_retail: 'New Construction - Retail',
  new_construction_office: 'New Construction - Office',
  reconstruction: 'Reconstruction / Renovation',
  demolition: 'Demolition',
  office_fitout: 'Office Fit-out',
  personal_renovation: 'Personal Home Renovation',
};

export const SUPPORTED_COUNTRIES = [
  { code: 'CZ', name: 'Czech Republic', currency: 'CZK' },
  { code: 'SK', name: 'Slovakia', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'PL', name: 'Poland', currency: 'PLN' },
  { code: 'SE', name: 'Sweden', currency: 'SEK' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'US', name: 'United States', currency: 'USD' },
];

export const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN', 'SEK'];
