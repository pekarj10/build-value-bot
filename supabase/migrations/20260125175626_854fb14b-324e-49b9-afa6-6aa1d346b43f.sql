-- Create benchmark_costs table for storing validated actual costs
CREATE TABLE public.benchmark_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_description TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity DECIMAL,
  unit_rate DECIMAL NOT NULL,
  total_cost DECIMAL NOT NULL,
  country_code TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  trust_score DECIMAL,
  approved BOOLEAN DEFAULT false,
  data_source TEXT DEFAULT 'user_actual',
  -- Add constraint for valid country codes
  CONSTRAINT valid_country_code CHECK (country_code ~ '^[A-Z]{2}$'),
  -- Validation rules
  CONSTRAINT positive_values CHECK (unit_rate > 0 AND total_cost > 0),
  CONSTRAINT reasonable_values CHECK (total_cost < 10000000)
);

-- Create indexes for efficient querying
CREATE INDEX idx_benchmark_costs_country ON public.benchmark_costs(country_code);
CREATE INDEX idx_benchmark_costs_category ON public.benchmark_costs(category);
CREATE INDEX idx_benchmark_costs_description ON public.benchmark_costs USING gin(to_tsvector('english', item_description));
CREATE INDEX idx_benchmark_costs_approved ON public.benchmark_costs(approved);

-- Enable RLS
ALTER TABLE public.benchmark_costs ENABLE ROW LEVEL SECURITY;

-- RLS policies - benchmark costs are readable by all authenticated users
CREATE POLICY "Authenticated users can view approved benchmark costs"
ON public.benchmark_costs
FOR SELECT
USING (approved = true OR is_admin(auth.uid()));

-- Only system/admins can insert benchmark costs
CREATE POLICY "Only admins can insert benchmark costs"
ON public.benchmark_costs
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Only admins can update (for approval workflow)
CREATE POLICY "Only admins can update benchmark costs"
ON public.benchmark_costs
FOR UPDATE
USING (is_admin(auth.uid()));

-- Only admins can delete
CREATE POLICY "Only admins can delete benchmark costs"
ON public.benchmark_costs
FOR DELETE
USING (is_admin(auth.uid()));

-- Create estimate_trust_scores table
CREATE TABLE public.estimate_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_item_id UUID NOT NULL REFERENCES public.cost_items(id) ON DELETE CASCADE,
  overall_trust_score DECIMAL NOT NULL CHECK (overall_trust_score >= 0 AND overall_trust_score <= 100),
  plausibility_score DECIMAL NOT NULL CHECK (plausibility_score >= 0 AND plausibility_score <= 100),
  similarity_score DECIMAL NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 100),
  reference_count INTEGER DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  explanation TEXT,
  country_code TEXT,
  CONSTRAINT unique_cost_item_trust UNIQUE (cost_item_id)
);

-- Create indexes
CREATE INDEX idx_trust_scores_cost_item ON public.estimate_trust_scores(cost_item_id);
CREATE INDEX idx_trust_scores_overall ON public.estimate_trust_scores(overall_trust_score);

-- Enable RLS
ALTER TABLE public.estimate_trust_scores ENABLE ROW LEVEL SECURITY;

-- Users can view trust scores for their project's cost items
CREATE POLICY "Users can view trust scores for their cost items"
ON public.estimate_trust_scores
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM cost_items ci
  JOIN projects p ON p.id = ci.project_id
  WHERE ci.id = estimate_trust_scores.cost_item_id
  AND (p.user_id = auth.uid() OR is_admin(auth.uid()))
));

-- System can insert trust scores (via edge function with service role)
CREATE POLICY "System can insert trust scores"
ON public.estimate_trust_scores
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM cost_items ci
  JOIN projects p ON p.id = ci.project_id
  WHERE ci.id = estimate_trust_scores.cost_item_id
  AND (p.user_id = auth.uid() OR is_admin(auth.uid()))
));

-- System can update trust scores
CREATE POLICY "System can update trust scores"
ON public.estimate_trust_scores
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM cost_items ci
  JOIN projects p ON p.id = ci.project_id
  WHERE ci.id = estimate_trust_scores.cost_item_id
  AND (p.user_id = auth.uid() OR is_admin(auth.uid()))
));

-- Add 'actual' to cost item status options by updating the status column default comment
COMMENT ON COLUMN public.cost_items.status IS 'Status: ok, review, clarification, underpriced, actual';