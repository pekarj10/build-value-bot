
-- Create enum for project member roles
CREATE TYPE public.project_role AS ENUM ('viewer', 'editor', 'admin');

-- Create project_members table
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role project_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Create project_invitations table for pending invites
CREATE TABLE public.project_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role project_role NOT NULL DEFAULT 'viewer',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(project_id, email, status)
);

-- Create cost_item_comments table
CREATE TABLE public.cost_item_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cost_item_id UUID NOT NULL REFERENCES public.cost_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_item_comments ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is a member of a project (with optional minimum role)
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = _user_id AND project_id = _project_id
  )
$$;

-- Helper function: check if user is project owner
CREATE OR REPLACE FUNCTION public.is_project_owner(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  )
$$;

-- Helper function: check if user can edit project (owner, admin member, or editor member)
CREATE OR REPLACE FUNCTION public.can_edit_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = _user_id AND project_id = _project_id AND role IN ('editor', 'admin')
  ) OR is_admin(_user_id)
$$;

-- project_members RLS policies
CREATE POLICY "Project owners and admins can manage members"
  ON public.project_members FOR ALL
  USING (
    is_project_owner(auth.uid(), project_id)
    OR is_admin(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.user_id = auth.uid() AND pm.project_id = project_members.project_id AND pm.role = 'admin'
      )
    )
  )
  WITH CHECK (
    is_project_owner(auth.uid(), project_id)
    OR is_admin(auth.uid())
  );

CREATE POLICY "Members can view their own membership"
  ON public.project_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_project_owner(auth.uid(), project_id)
    OR is_project_member(auth.uid(), project_id)
    OR is_admin(auth.uid())
  );

-- project_invitations RLS policies
CREATE POLICY "Project owners can manage invitations"
  ON public.project_invitations FOR ALL
  USING (
    is_project_owner(auth.uid(), project_id)
    OR is_admin(auth.uid())
  )
  WITH CHECK (
    is_project_owner(auth.uid(), project_id)
    OR is_admin(auth.uid())
  );

CREATE POLICY "Invitees can view their own invitations"
  ON public.project_invitations FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR is_project_owner(auth.uid(), project_id)
    OR is_admin(auth.uid())
  );

-- cost_item_comments RLS policies
CREATE POLICY "Project members can view comments"
  ON public.cost_item_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cost_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = cost_item_comments.cost_item_id
      AND (
        p.user_id = auth.uid()
        OR is_project_member(auth.uid(), p.id)
        OR is_admin(auth.uid())
      )
    )
  );

CREATE POLICY "Project editors can create comments"
  ON public.cost_item_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM cost_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = cost_item_comments.cost_item_id
      AND (
        p.user_id = auth.uid()
        OR can_edit_project(auth.uid(), p.id)
        OR is_admin(auth.uid())
      )
    )
  );

CREATE POLICY "Users can update their own comments"
  ON public.cost_item_comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments or project owners can"
  ON public.cost_item_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cost_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = cost_item_comments.cost_item_id
      AND (p.user_id = auth.uid() OR is_admin(auth.uid()))
    )
  );

-- Update existing projects RLS to include project members
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_project_member(auth.uid(), id)
    OR is_admin(auth.uid())
  );

-- Update cost_items SELECT policy to include project members
DROP POLICY IF EXISTS "Users can view cost items of their projects" ON public.cost_items;
CREATE POLICY "Users can view cost items of their projects"
  ON public.cost_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = cost_items.project_id
      AND (
        projects.user_id = auth.uid()
        OR is_project_member(auth.uid(), projects.id)
        OR is_admin(auth.uid())
      )
    )
  );

-- Update cost_items UPDATE policy to include editors
DROP POLICY IF EXISTS "Users can update cost items of their projects" ON public.cost_items;
CREATE POLICY "Users can update cost items of their projects"
  ON public.cost_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = cost_items.project_id
      AND (
        projects.user_id = auth.uid()
        OR can_edit_project(auth.uid(), projects.id)
        OR is_admin(auth.uid())
      )
    )
  );

-- Update uploaded_files SELECT to include members
DROP POLICY IF EXISTS "Users can view files of their projects" ON public.uploaded_files;
CREATE POLICY "Users can view files of their projects"
  ON public.uploaded_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = uploaded_files.project_id
      AND (
        projects.user_id = auth.uid()
        OR is_project_member(auth.uid(), projects.id)
        OR is_admin(auth.uid())
      )
    )
  );

-- Update estimate_trust_scores SELECT to include members
DROP POLICY IF EXISTS "Users can view trust scores for their cost items" ON public.estimate_trust_scores;
CREATE POLICY "Users can view trust scores for their cost items"
  ON public.estimate_trust_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cost_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = estimate_trust_scores.cost_item_id
      AND (
        p.user_id = auth.uid()
        OR is_project_member(auth.uid(), p.id)
        OR is_admin(auth.uid())
      )
    )
  );

-- Update cost_item_mutations SELECT to include members
DROP POLICY IF EXISTS "Users can view mutations of their project cost items" ON public.cost_item_mutations;
CREATE POLICY "Users can view mutations of their project cost items"
  ON public.cost_item_mutations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cost_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = cost_item_mutations.cost_item_id
      AND (
        p.user_id = auth.uid()
        OR is_project_member(auth.uid(), p.id)
        OR is_admin(auth.uid())
      )
    )
  );
