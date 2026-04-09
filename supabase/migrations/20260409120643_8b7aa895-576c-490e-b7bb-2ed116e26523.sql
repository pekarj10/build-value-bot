
-- Table for storing presentation share tokens
CREATE TABLE public.project_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index on token for fast lookups
CREATE UNIQUE INDEX idx_share_tokens_token ON public.project_share_tokens(token);

-- Index for project lookups
CREATE INDEX idx_share_tokens_project ON public.project_share_tokens(project_id);

-- Enable RLS
ALTER TABLE public.project_share_tokens ENABLE ROW LEVEL SECURITY;

-- Project owners and admins can manage tokens
CREATE POLICY "Project owners can manage share tokens"
  ON public.project_share_tokens
  FOR ALL
  TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR public.is_project_admin(project_id, auth.uid())
  )
  WITH CHECK (
    public.is_project_owner(project_id, auth.uid())
    OR public.is_project_admin(project_id, auth.uid())
  );

-- Anyone (including anon) can read active tokens for presentation view
CREATE POLICY "Anyone can read active share tokens"
  ON public.project_share_tokens
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Allow anon users to read projects via share tokens (for presentation view)
CREATE POLICY "Anon can read projects via share token"
  ON public.projects
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.project_share_tokens
      WHERE project_share_tokens.project_id = projects.id
        AND project_share_tokens.is_active = true
        AND (project_share_tokens.expires_at IS NULL OR project_share_tokens.expires_at > now())
    )
  );

-- Allow anon users to read cost items for shared projects
CREATE POLICY "Anon can read cost items via share token"
  ON public.cost_items
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.project_share_tokens
      WHERE project_share_tokens.project_id = cost_items.project_id
        AND project_share_tokens.is_active = true
        AND (project_share_tokens.expires_at IS NULL OR project_share_tokens.expires_at > now())
    )
  );
