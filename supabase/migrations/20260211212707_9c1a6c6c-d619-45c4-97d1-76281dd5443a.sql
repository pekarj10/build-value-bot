
-- Add company and notification preferences to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS project_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_digest boolean NOT NULL DEFAULT false;
