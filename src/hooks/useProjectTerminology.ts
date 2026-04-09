import { useMemo } from 'react';
import { ProjectType } from '@/types/project';

export type ProjectContext = 'commercial' | 'personal';

export interface ProjectTerminology {
  context: ProjectContext;
  totalBudgetLabel: string;
  totalBudgetShort: string;
  categoryLabel: string;
  categoriesLabel: string;
  summaryTitle: string;
  summarySubtitle: string;
  overrideLabel: string;
  reportTitle: string;
  reportSubtitle: string;
  budgetChartTitle: string;
  costDriversTitle: string;
  insightsTitle: string;
  varianceLabel: string;
}

const PERSONAL_TYPES: string[] = [
  'personal_renovation',
  'reconstruction',
];

export function getProjectContext(projectType: string): ProjectContext {
  return PERSONAL_TYPES.includes(projectType) ? 'personal' : 'commercial';
}

const COMMERCIAL: ProjectTerminology = {
  context: 'commercial',
  totalBudgetLabel: 'Total Estimated CAPEX',
  totalBudgetShort: 'CAPEX',
  categoryLabel: 'TDD Category',
  categoriesLabel: 'TDD Categories',
  summaryTitle: 'CAPEX Executive Summary',
  summarySubtitle: 'Technical Due Diligence Overview',
  overrideLabel: 'Auditor Override',
  reportTitle: 'TDD / CAPEX Estimate Report',
  reportSubtitle: 'Technical Due Diligence Report',
  budgetChartTitle: 'Budget by TDD Category',
  costDriversTitle: 'Cost Drivers',
  insightsTitle: 'TDD Insights',
  varianceLabel: 'Variance vs Benchmark',
};

const PERSONAL: ProjectTerminology = {
  context: 'personal',
  totalBudgetLabel: 'Estimated Renovation Budget',
  totalBudgetShort: 'Budget',
  categoryLabel: 'Work Category',
  categoriesLabel: 'Work Categories',
  summaryTitle: 'Budget Overview',
  summarySubtitle: 'Renovation Cost Summary',
  overrideLabel: 'Manual Price',
  reportTitle: 'Renovation Estimate Report',
  reportSubtitle: 'Home Renovation Budget Report',
  budgetChartTitle: 'Budget by Work Category',
  costDriversTitle: 'Biggest Expenses',
  insightsTitle: 'Budget Insights',
  varianceLabel: 'Variance vs Market',
};

export function getTerminology(projectType: string): ProjectTerminology {
  return getProjectContext(projectType) === 'personal' ? PERSONAL : COMMERCIAL;
}

export function useProjectTerminology(projectType: string): ProjectTerminology {
  return useMemo(() => getTerminology(projectType), [projectType]);
}
