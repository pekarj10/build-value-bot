import { describe, it, expect } from 'vitest';
import {
  getEffectivePrice,
  computeTotalOriginal,
  computeTotalEstimated,
  computeAvgVariance,
  computeItemVariance,
} from '@/lib/reportCalculations';
import { CostItem } from '@/types/project';

/** Helper */
function makeItem(overrides: Partial<CostItem> = {}): CostItem {
  return {
    id: 'test-1',
    projectId: 'proj-1',
    originalDescription: 'Test item',
    quantity: 1,
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

// ─── Budget Variance Calculations ────────────────────────────────

describe('Budget variance: original vs AI recommended', () => {
  it('computes overall budget delta correctly', () => {
    const items = [
      makeItem({ originalUnitPrice: 100, recommendedUnitPrice: 120, quantity: 10 }),
      makeItem({ originalUnitPrice: 200, recommendedUnitPrice: 180, quantity: 5 }),
      makeItem({ originalUnitPrice: 50, recommendedUnitPrice: 55, quantity: 20 }),
    ];

    const totalOriginal = computeTotalOriginal(items);
    const totalEstimated = computeTotalEstimated(items);

    expect(totalOriginal).toBe(100 * 10 + 200 * 5 + 50 * 20); // 1000 + 1000 + 1000 = 3000
    expect(totalEstimated).toBe(120 * 10 + 180 * 5 + 55 * 20); // 1200 + 900 + 1100 = 3200

    const budgetDelta = totalEstimated - totalOriginal;
    expect(budgetDelta).toBe(200); // AI budget is 200 higher

    const deltaPercent = (budgetDelta / totalOriginal) * 100;
    expect(deltaPercent).toBeCloseTo(6.67, 1);
  });

  it('handles items where AI recommends lower prices (savings)', () => {
    const items = [
      makeItem({ originalUnitPrice: 500, recommendedUnitPrice: 350, quantity: 4 }),
    ];

    const totalOriginal = computeTotalOriginal(items);
    const totalEstimated = computeTotalEstimated(items);

    expect(totalOriginal).toBe(2000);
    expect(totalEstimated).toBe(1400);
    expect(totalEstimated - totalOriginal).toBe(-600); // 600 savings
  });

  it('handles mixed: some items matched, some not', () => {
    const items = [
      makeItem({ originalUnitPrice: 100, recommendedUnitPrice: 90, quantity: 10 }),
      makeItem({ originalUnitPrice: 200, recommendedUnitPrice: null, quantity: 5 }), // unmatched → falls back to original
    ];

    const totalOriginal = computeTotalOriginal(items);
    const totalEstimated = computeTotalEstimated(items);

    expect(totalOriginal).toBe(2000);
    // Item 1: rec=90, item 2: falls back to original=200
    expect(totalEstimated).toBe(900 + 1000);
  });
});

describe('Per-item variance percentage', () => {
  it('calculates +25% when original is 125 vs benchmark 100', () => {
    expect(computeItemVariance(125, 100)).toBeCloseTo(25);
  });

  it('calculates -50% when original is 50 vs benchmark 100', () => {
    expect(computeItemVariance(50, 100)).toBeCloseTo(-50);
  });

  it('handles large variance (overpriced 3x)', () => {
    expect(computeItemVariance(300, 100)).toBeCloseTo(200);
  });
});

describe('Average variance across portfolio', () => {
  it('averages variance correctly across multiple items', () => {
    const items = [
      makeItem({ originalUnitPrice: 120, benchmarkTypical: 100 }), // +20%
      makeItem({ originalUnitPrice: 80, benchmarkTypical: 100 }),  // -20%
      makeItem({ originalUnitPrice: 100, benchmarkTypical: 100 }), //  0%
    ];
    expect(computeAvgVariance(items)).toBeCloseTo(0);
  });

  it('excludes items missing benchmark data', () => {
    const items = [
      makeItem({ originalUnitPrice: 150, benchmarkTypical: 100 }), // +50%
      makeItem({ originalUnitPrice: 200, benchmarkTypical: null }), // excluded
      makeItem({ originalUnitPrice: null, benchmarkTypical: 100 }), // excluded
    ];
    expect(computeAvgVariance(items)).toBeCloseTo(50);
  });
});

describe('User override takes precedence in estimated budget', () => {
  it('user override price overrides AI recommendation', () => {
    const item = makeItem({
      originalUnitPrice: 100,
      recommendedUnitPrice: 120,
      userOverridePrice: 95,
      quantity: 10,
    });

    expect(getEffectivePrice(item)).toBe(95);
    expect(computeTotalEstimated([item])).toBe(950);
  });

  it('with multiple items and mixed overrides', () => {
    const items = [
      makeItem({ originalUnitPrice: 100, recommendedUnitPrice: 110, userOverridePrice: 90, quantity: 5 }),
      makeItem({ originalUnitPrice: 200, recommendedUnitPrice: 180, quantity: 3 }), // no override
    ];

    const totalEstimated = computeTotalEstimated(items);
    expect(totalEstimated).toBe(90 * 5 + 180 * 3); // 450 + 540 = 990
  });
});
