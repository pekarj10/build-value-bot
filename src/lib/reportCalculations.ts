/**
 * Pure calculation functions extracted from pdfReport.ts for testability.
 * These are the core budget math used in Executive Summary and PDF export.
 */
import { CostItem } from '@/types/project';
import { inferTddCategory, type TddCategory } from '@/lib/tddCategories';

/** Effective unit price: user override > AI recommended > original */
export function getEffectivePrice(item: CostItem): number | null {
  return item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice ?? null;
}

/** Total original budget (original price × quantity) */
export function computeTotalOriginal(items: CostItem[]): number {
  return items.reduce((s, i) => s + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
}

/** Total estimated budget (effective price × quantity) */
export function computeTotalEstimated(items: CostItem[]): number {
  return items.reduce((s, i) => {
    const p = getEffectivePrice(i);
    return s + (p != null ? p * i.quantity : 0);
  }, 0);
}

/** Total potential savings where original > recommended */
export function computePotentialSavings(items: CostItem[]): number {
  return items.reduce((s, item) => {
    const recPrice = item.userOverridePrice || item.recommendedUnitPrice;
    if (item.originalUnitPrice && recPrice && item.originalUnitPrice > recPrice) {
      return s + (item.originalUnitPrice - recPrice) * item.quantity;
    }
    return s;
  }, 0);
}

/** Average variance % of original price vs benchmark typical */
export function computeAvgVariance(items: CostItem[]): number {
  const withVariance = items.filter(i => i.originalUnitPrice && i.benchmarkTypical && i.benchmarkTypical !== 0);
  if (withVariance.length === 0) return 0;
  return withVariance.reduce(
    (s, i) => s + ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100,
    0
  ) / withVariance.length;
}

/** Variance % for a single item (original vs benchmark typical) */
export function computeItemVariance(originalPrice: number, benchmarkTypical: number): number {
  if (benchmarkTypical === 0) return 0;
  return ((originalPrice - benchmarkTypical) / benchmarkTypical) * 100;
}

/** Sum estimated budget by TDD category */
export function computeCategoryBreakdown(items: CostItem[]): Map<TddCategory, { estimated: number; count: number }> {
  const breakdown = new Map<TddCategory, { estimated: number; count: number }>();
  for (const item of items) {
    const cat = inferTddCategory(null, item.trade, item.originalDescription);
    const existing = breakdown.get(cat) || { estimated: 0, count: 0 };
    const p = getEffectivePrice(item);
    existing.estimated += p != null ? p * item.quantity : 0;
    existing.count++;
    breakdown.set(cat, existing);
  }
  return breakdown;
}

/** Sum estimated budget by trade */
export function computeTradeBreakdown(items: CostItem[]): Map<string, { original: number; estimated: number; count: number }> {
  const breakdown = new Map<string, { original: number; estimated: number; count: number }>();
  for (const item of items) {
    const trade = item.trade?.trim() || 'Uncategorized';
    const existing = breakdown.get(trade) || { original: 0, estimated: 0, count: 0 };
    existing.original += item.originalUnitPrice ? item.originalUnitPrice * item.quantity : 0;
    const p = getEffectivePrice(item);
    existing.estimated += p != null ? p * item.quantity : 0;
    existing.count++;
    breakdown.set(trade, existing);
  }
  return breakdown;
}
