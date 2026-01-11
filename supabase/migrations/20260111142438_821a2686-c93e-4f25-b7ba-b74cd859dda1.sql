-- Add DELETE policy for profiles (users can only delete their own profile)
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
USING (auth.uid() = id);

-- Ensure storage bucket has proper RLS policies
-- First check if policies exist and recreate with proper restrictions
DROP POLICY IF EXISTS "Authenticated users can upload project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their project files" ON storage.objects;

-- Storage policies that check project ownership via folder structure (projectId/filename)
CREATE POLICY "Users can upload to their projects"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'project-files' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id::text = (storage.foldername(name))[1]
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view their project files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'project-files'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id::text = (storage.foldername(name))[1]
    AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Users can delete their project files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'project-files'
  AND EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id::text = (storage.foldername(name))[1]
    AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
);