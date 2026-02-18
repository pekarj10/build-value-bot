
-- Add benchmark update notification columns to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS pending_benchmark_update boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_update_summary text,
  ADD COLUMN IF NOT EXISTS pending_update_since timestamp with time zone,
  ADD COLUMN IF NOT EXISTS pending_update_dismissed_at timestamp with time zone;

COMMENT ON COLUMN public.projects.pending_benchmark_update IS 'True when benchmarks matched to this project''s cost items have been changed/deleted by admin';
COMMENT ON COLUMN public.projects.pending_update_summary IS 'Human-readable summary of what changed (e.g. "3 of your cost items have updated benchmark prices")';
COMMENT ON COLUMN public.projects.pending_update_since IS 'When the pending update was flagged';
COMMENT ON COLUMN public.projects.pending_update_dismissed_at IS 'When user dismissed the notification. Reappears once after 7 days if still pending, then clears forever.';
