-- Create benchmark_prices table for storing market reference prices
CREATE TABLE public.benchmark_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  min_price NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,
  max_price NUMERIC NOT NULL,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_benchmark_prices_country ON public.benchmark_prices(country);
CREATE INDEX idx_benchmark_prices_category ON public.benchmark_prices(category);
CREATE INDEX idx_benchmark_prices_country_category ON public.benchmark_prices(country, category);

-- Enable RLS
ALTER TABLE public.benchmark_prices ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (benchmarks are public reference data)
CREATE POLICY "Benchmark prices are readable by everyone" 
ON public.benchmark_prices 
FOR SELECT 
USING (true);

-- Create projects table to store project data
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  project_type TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total_items INTEGER DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  issues_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for projects (public access for now, can add auth later)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects are publicly readable" 
ON public.projects FOR SELECT USING (true);

CREATE POLICY "Projects are publicly insertable" 
ON public.projects FOR INSERT WITH CHECK (true);

CREATE POLICY "Projects are publicly updatable" 
ON public.projects FOR UPDATE USING (true);

-- Create cost_items table
CREATE TABLE public.cost_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sheet_name TEXT,
  trade TEXT,
  original_description TEXT NOT NULL,
  interpreted_scope TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  original_unit_price NUMERIC,
  recommended_unit_price NUMERIC,
  benchmark_min NUMERIC,
  benchmark_typical NUMERIC,
  benchmark_max NUMERIC,
  total_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'clarification',
  ai_comment TEXT,
  clarification_question TEXT,
  user_clarification TEXT,
  user_override_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for project lookups
CREATE INDEX idx_cost_items_project_id ON public.cost_items(project_id);

-- Enable RLS for cost_items
ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cost items are publicly readable" 
ON public.cost_items FOR SELECT USING (true);

CREATE POLICY "Cost items are publicly insertable" 
ON public.cost_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Cost items are publicly updatable" 
ON public.cost_items FOR UPDATE USING (true);

CREATE POLICY "Cost items are publicly deletable" 
ON public.cost_items FOR DELETE USING (true);

-- Create uploaded_files table to track file uploads
CREATE TABLE public.uploaded_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_uploaded_files_project_id ON public.uploaded_files(project_id);

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Uploaded files are publicly readable" 
ON public.uploaded_files FOR SELECT USING (true);

CREATE POLICY "Uploaded files are publicly insertable" 
ON public.uploaded_files FOR INSERT WITH CHECK (true);

CREATE POLICY "Uploaded files are publicly updatable" 
ON public.uploaded_files FOR UPDATE USING (true);

-- Create storage bucket for project files
INSERT INTO storage.buckets (id, name, public) VALUES ('project-files', 'project-files', false);

-- Storage policies for project files
CREATE POLICY "Project files are publicly uploadable"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-files');

CREATE POLICY "Project files are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-files');

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_benchmark_prices_updated_at
BEFORE UPDATE ON public.benchmark_prices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cost_items_updated_at
BEFORE UPDATE ON public.cost_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample benchmark data for testing
INSERT INTO public.benchmark_prices (category, description, unit, country, currency, min_price, avg_price, max_price, source) VALUES
('Concrete', 'Reinforced concrete C30/37, including formwork and rebar', 'm3', 'CZ', 'CZK', 4500, 5500, 7000, 'Market average 2024'),
('Concrete', 'Concrete slab, ground bearing, 150mm thick', 'm2', 'CZ', 'CZK', 850, 1100, 1400, 'Market average 2024'),
('Masonry', 'Clay block masonry, 300mm thick, including mortar', 'm2', 'CZ', 'CZK', 1200, 1600, 2100, 'Market average 2024'),
('Windows', 'PVC window, triple glazing, standard size', 'm2', 'CZ', 'CZK', 4500, 6000, 8500, 'Market average 2024'),
('Flooring', 'Laminate flooring, including underlay', 'm2', 'CZ', 'CZK', 450, 650, 950, 'Market average 2024'),
('Flooring', 'Ceramic tiles, including adhesive and grouting', 'm2', 'CZ', 'CZK', 800, 1200, 1800, 'Market average 2024'),
('HVAC', 'Split air conditioning unit, residential', 'pcs', 'CZ', 'CZK', 25000, 35000, 55000, 'Market average 2024'),
('Electrical', 'Electrical installation, residential standard', 'm2', 'CZ', 'CZK', 1200, 1800, 2500, 'Market average 2024'),
('Plumbing', 'Bathroom complete installation, standard', 'pcs', 'CZ', 'CZK', 85000, 120000, 180000, 'Market average 2024'),
('Demolition', 'Interior demolition, non-structural', 'm2', 'CZ', 'CZK', 150, 250, 400, 'Market average 2024');