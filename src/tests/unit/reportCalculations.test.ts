import { describe, it, expect } from 'vitest';
import {
  getEffectivePrice,
  computeTotalOriginal,
  computeTotalEstimated,
  computePotentialSavings,
  computeAvgVariance,
  computeItemVariance,
  computeCategoryBreakdown,
  computeTradeBreakdown,
} from '@/lib/reportCalculations';
import { CostItem } from '@/types/project';

/** Helper to create a minimal CostItem for testing */
function makeItem(overrides: Partial<CostItem> = {}): CostItem {
  return {
    id: 'test-1',
    projectId: 'proj-1',
    originalDescription: 'Test item',
    quantity: 10,
    unit: 'm²',
    status: 'ok',
    originalUnitPrice: null,
    recommendedUnitPrice: null,
    userOverridePrice: null,
    benchmarkMin: null,
    benchmarkTypical: null,
    benchmarkMax: null,
    totalPrice: null,
    matchConfidence: null,
    matchedBenchmarkId: null,
    matchReasoning: null,
    priceSource: null,
    userExplanation: null,
    mutationCount: 0,
    lastModifiedBy: null,
    lastModifiedAt: null,
    ...overrides,
  } as CostItem;
}

// ─── getEffectivePrice ───────────────────────────────────────────

describe('getEffectivePrice', () => {
  it('returns userOverridePrice when set', () => {
    const item = makeItem({ userOverridePrice: 100, recommendedUnitPrice: 80, originalUnitPrice: 60 });
    expect(getEffectivePrice(item)).toBe(100);
  });

  it('falls back to recommendedUnitPrice', () => {
    const item = makeItem({ recommendedUnitPrice: 80, originalUnitPrice: 60 });
    expect(getEffectivePrice(item)).toBe(80);
  });

  it('falls back to originalUnitPrice', () => {
    const item = makeItem({ originalUnitPrice: 60 });
    expect(getEffectivePrice(item)).toBe(60);
  });

  it('returns null if no prices set', () => {
    expect(getEffectivePrice(makeItem())).toBeNull();
  });
});

// ─── computeTotalOriginal ────────────────────────────────────────

describe('computeTotalOriginal', () => {
  it('sums original price × quantity', () => {
    const items = [
      makeItem({ originalUnitPrice: 100, quantity: 5 }),
      makeItem({ originalUnitPrice: 200, quantity: 3 }),
    ];
    expect(computeTotalOriginal(items)).toBe(100 * 5 + 200 * 3);
  });

  it('skips items without original price', () => {
    const items = [
      makeItem({ originalUnitPrice: 100, quantity: 5 }),
      makeItem({ originalUnitPrice: null, quantity: 10 }),
    ];
    expect(computeTotalOriginal(items)).toBe(500);
  });

  it('returns 0 for empty array', () => {
    expect(computeTotalOriginal([])).toBe(0);
  });
});

// ─── computeTotalEstimated ───────────────────────────────────────

describe('computeTotalEstimated', () => {
  it('uses effective price priority', () => {
    const items = [
      makeItem({ userOverridePrice: 150, recommendedUnitPrice: 100, originalUnitPrice: 80, quantity: 10 }),
    ];
    // Should use userOverridePrice = 150
    expect(computeTotalEstimated(items)).toBe(1500);
  });

  it('falls back through the price chain', () => {
    const items = [
      makeItem({ recommendedUnitPrice: 100, quantity: 4 }),
      makeItem({ originalUnitPrice: 50, quantity: 6 }),
      makeItem({ quantity: 3 }), // no price → 0
    ];
    expect(computeTotalEstimated(items)).toBe(400 + 300 + 0);
  });

  it('returns 0 for no items', () => {
    expect(computeTotalEstimated([])).toBe(0);
  });
});

// ─── computePotentialSavings ─────────────────────────────────────

describe('computePotentialSavings', () => {
  it('calculates savings when original > recommended', () => {
    const items = [
      makeItem({ originalUnitPrice: 200, recommendedUnitPrice: 150, quantity: 10 }),
    ];
    expect(computePotentialSavings(items)).toBe(500); // (200-150)*10
  });

  it('returns 0 when recommended > original', () => {
    const items = [
      makeItem({ originalUnitPrice: 100, recommendedUnitPrice: 150, quantity: 10 }),
    ];
    expect(computePotentialSavings(items)).toBe(0);
  });

  it('prefers userOverridePrice for savings calc', () => {
    const items = [
      makeItem({ originalUnitPrice: 200, userOverridePrice: 120, recommendedUnitPrice: 150, quantity: 5 }),
    ];
    // Uses userOverridePrice=120: (200-120)*5 = 400
    expect(computePotentialSavings(items)).toBe(400);
  });

  it('skips items without original price', () => {
    const items = [
      makeItem({ originalUnitPrice: null, recommendedUnitPrice: 100, quantity: 10 }),
    ];
    expect(computePotentialSavings(items)).toBe(0);
  });
});

// ─── computeAvgVariance ──────────────────────────────────────────

describe('computeAvgVariance', () => {
  it('computes correct variance percentage', () => {
    const items = [
      makeItem({ originalUnitPrice: 110, benchmarkTypical: 100 }), // +10%
      makeItem({ originalUnitPrice: 90, benchmarkTypical: 100 }),  // -10%
    ];
    expect(computeAvgVariance(items)).toBeCloseTo(0); // average of +10% and -10%
  });

  it('returns 0 when no items have both prices', () => {
    const items = [
      makeItem({ originalUnitPrice: null, benchmarkTypical: 100 }),
    ];
    expect(computeAvgVariance(items)).toBe(0);
  });

  it('skips items with benchmarkTypical = 0', () => {
    const items = [
      makeItem({ originalUnitPrice: 100, benchmarkTypical: 0 }),
    ];
    expect(computeAvgVariance(items)).toBe(0);
  });

  it('handles single item', () => {
    const items = [
      makeItem({ originalUnitPrice: 150, benchmarkTypical: 100 }), // +50%
    ];
    expect(computeAvgVariance(items)).toBeCloseTo(50);
  });
});

// ─── computeItemVariance ─────────────────────────────────────────

describe('computeItemVariance', () => {
  it('returns positive variance when overpriced', () => {
    expect(computeItemVariance(120, 100)).toBeCloseTo(20);
  });

  it('returns negative variance when underpriced', () => {
    expect(computeItemVariance(80, 100)).toBeCloseTo(-20);
  });

  it('returns 0 for exact match', () => {
    expect(computeItemVariance(100, 100)).toBe(0);
  });

  it('returns 0 when benchmark is zero', () => {
    expect(computeItemVariance(100, 0)).toBe(0);
  });
});

// ─── computeTradeBreakdown ───────────────────────────────────────

describe('computeTradeBreakdown', () => {
  it('groups items by trade', () => {
    const items = [
      makeItem({ trade: 'Plumbing', originalUnitPrice: 100, recommendedUnitPrice: 90, quantity: 2 }),
      makeItem({ trade: 'Plumbing', originalUnitPrice: 200, recommendedUnitPrice: 180, quantity: 1 }),
      makeItem({ trade: 'Electrical', originalUnitPrice: 300, recommendedUnitPrice: 250, quantity: 3 }),
    ];
    const breakdown = computeTradeBreakdown(items);

    expect(breakdown.get('Plumbing')!.count).toBe(2);
    expect(breakdown.get('Plumbing')!.original).toBe(100 * 2 + 200 * 1);
    expect(breakdown.get('Plumbing')!.estimated).toBe(90 * 2 + 180 * 1);

    expect(breakdown.get('Electrical')!.count).toBe(1);
    expect(breakdown.get('Electrical')!.original).toBe(900);
    expect(breakdown.get('Electrical')!.estimated).toBe(750);
  });

  it('uses "Uncategorized" for empty trade', () => {
    const items = [makeItem({ trade: null, originalUnitPrice: 100, quantity: 1 })];
    const breakdown = computeTradeBreakdown(items);
    expect(breakdown.has('Uncategorized')).toBe(true);
  });
});

// ─── computeCategoryBreakdown ────────────────────────────────────

describe('computeCategoryBreakdown', () => {
  it('groups items by inferred TDD category', () => {
    const items = [
      makeItem({ trade: 'HVAC', originalDescription: 'Ventilation duct', recommendedUnitPrice: 500, quantity: 4 }),
      makeItem({ trade: 'HVAC', originalDescription: 'AHU replacement', recommendedUnitPrice: 1000, quantity: 1 }),
    ];
    const breakdown = computeCategoryBreakdown(items);
    // Both should map to the same TDD category
    const totalEstimated = Array.from(breakdown.values()).reduce((s, v) => s + v.estimated, 0);
    expect(totalEstimated).toBe(500 * 4 + 1000 * 1);
  });

  it('returns empty map for empty items', () => {
    expect(computeCategoryBreakdown([]).size).toBe(0);
  });
});
