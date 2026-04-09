/**
 * TDD Master Categories for Technical Due Diligence analytics.
 * When cost_items receives a `tdd_category` column from AI, this mapping
 * will be replaced by actual data. For now we infer categories from the
 * trade / description fields already present on each item.
 */

export const TDD_CATEGORIES = [
  'Structural',
  'Facade',
  'Roof',
  'Interior Finishes',
  'MEP / HVAC',
  'Site Works',
  'Other',
] as const;

export type TddCategory = (typeof TDD_CATEGORIES)[number];

/** Professional muted palette – one colour per TDD category */
export const TDD_CATEGORY_COLORS: Record<TddCategory, string> = {
  Structural: 'hsl(222, 47%, 38%)',
  Facade: 'hsl(200, 45%, 44%)',
  Roof: 'hsl(174, 42%, 40%)',
  'Interior Finishes': 'hsl(38, 55%, 50%)',
  'MEP / HVAC': 'hsl(260, 35%, 52%)',
  'Site Works': 'hsl(142, 40%, 42%)',
  Other: 'hsl(220, 14%, 55%)',
};

const TRADE_TO_TDD: Record<string, TddCategory> = {
  'concrete works': 'Structural',
  concrete: 'Structural',
  structural: 'Structural',
  steel: 'Structural',
  foundations: 'Structural',
  masonry: 'Structural',

  facade: 'Facade',
  'external walls': 'Facade',
  cladding: 'Facade',
  windows: 'Facade',
  glazing: 'Facade',
  curtain: 'Facade',

  roofing: 'Roof',
  roof: 'Roof',
  waterproofing: 'Roof',

  finishes: 'Interior Finishes',
  flooring: 'Interior Finishes',
  painting: 'Interior Finishes',
  'interior walls': 'Interior Finishes',
  partitions: 'Interior Finishes',
  ceilings: 'Interior Finishes',
  joinery: 'Interior Finishes',
  doors: 'Interior Finishes',
  tiling: 'Interior Finishes',

  hvac: 'MEP / HVAC',
  mechanical: 'MEP / HVAC',
  electrical: 'MEP / HVAC',
  plumbing: 'MEP / HVAC',
  'fire protection': 'MEP / HVAC',
  bms: 'MEP / HVAC',

  earthworks: 'Site Works',
  landscaping: 'Site Works',
  'site works': 'Site Works',
  demolition: 'Site Works',
  excavation: 'Site Works',
  paving: 'Site Works',
  utilities: 'Site Works',
};

/**
 * Derive a TDD Master Category from an item's trade (or description as fallback).
 * Once the backend provides `tdd_category`, prefer that value instead.
 */
export function inferTddCategory(
  tddCategory?: string | null,
  trade?: string | null,
  description?: string | null,
): TddCategory {
  // Prefer explicit AI-assigned category
  if (tddCategory && TDD_CATEGORIES.includes(tddCategory as TddCategory)) {
    return tddCategory as TddCategory;
  }

  const haystack = `${trade ?? ''} ${description ?? ''}`.toLowerCase();

  for (const [keyword, cat] of Object.entries(TRADE_TO_TDD)) {
    if (haystack.includes(keyword)) return cat;
  }

  return 'Other';
}
