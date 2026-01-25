-- Add flagged_for_review and flag_reason columns to benchmark_costs
ALTER TABLE public.benchmark_costs 
ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flag_reason TEXT;

-- Create index for faster queries on flagged items
CREATE INDEX IF NOT EXISTS idx_benchmark_costs_flagged 
ON public.benchmark_costs(flagged_for_review) 
WHERE flagged_for_review = true;