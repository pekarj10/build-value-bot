
-- Create a security definer function to check project-level admin role
-- This avoids inline queries on project_members that cause RLS recursion
CREATE OR REPLACE FUNCTION public.is_project_admin(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = _user_id AND project_id = _project_id AND role = 'admin'
  )
$$;

-- Drop the problematic policies
DROP POLICY IF EXISTS "Project owners and admins can manage members" ON public.project_members;
DROP POLICY IF EXISTS "Members can view their own membership" ON public.project_members;

-- Recreate without inline project_members queries
CREATE POLICY "Project owners and admins can manage members"
ON public.project_members
FOR ALL
TO authenticated
USING (
  is_project_owner(auth.uid(), project_id)
  OR is_admin(auth.uid())
  OR is_project_admin(auth.uid(), project_id)
)
WITH CHECK (
  is_project_owner(auth.uid(), project_id)
  OR is_admin(auth.uid())
);

CREATE POLICY "Members can view their own membership"
ON public.project_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_project_owner(auth.uid(), project_id)
  OR is_project_member(auth.uid(), project_id)
  OR is_admin(auth.uid())
);
