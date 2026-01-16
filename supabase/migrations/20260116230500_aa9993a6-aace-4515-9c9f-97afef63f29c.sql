-- Add project_notes column to projects table for rich text notes
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS project_notes TEXT DEFAULT '';

-- Add index for faster queries on notes (optional, for full-text search later)
CREATE INDEX IF NOT EXISTS idx_projects_notes ON public.projects USING gin(to_tsvector('english', COALESCE(project_notes, '')));