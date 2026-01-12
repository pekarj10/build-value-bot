-- Add benchmark matching columns to cost_items table
ALTER TABLE public.cost_items
ADD COLUMN IF NOT EXISTS matched_benchmark_id uuid REFERENCES public.benchmark_prices(id),
ADD COLUMN IF NOT EXISTS match_confidence numeric,
ADD COLUMN IF NOT EXISTS match_reasoning text;

-- Create index for faster benchmark lookups
CREATE INDEX IF NOT EXISTS idx_cost_items_matched_benchmark ON public.cost_items(matched_benchmark_id);

-- Create index for benchmark lookups by country and unit
CREATE INDEX IF NOT EXISTS idx_benchmark_prices_country_unit ON public.benchmark_prices(country, unit);

-- Add source field to track where the price came from
ALTER TABLE public.cost_items
ADD COLUMN IF NOT EXISTS price_source text;

COMMENT ON COLUMN public.cost_items.matched_benchmark_id IS 'Reference to the matched benchmark price entry';
COMMENT ON COLUMN public.cost_items.match_confidence IS 'AI confidence score (0-100) for the benchmark match';
COMMENT ON COLUMN public.cost_items.match_reasoning IS 'AI explanation of why this benchmark was selected';
COMMENT ON COLUMN public.cost_items.price_source IS 'Source of the recommended price (e.g., "REPAB 2025 - Textilgolv byte")';