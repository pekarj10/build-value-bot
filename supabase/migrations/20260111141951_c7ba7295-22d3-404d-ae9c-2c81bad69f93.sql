-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
  )
$$;

-- Create trigger function for new user profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  
  -- Also create default user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user');
  
  RETURN new;
END;
$$;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add user_id column to projects table
ALTER TABLE public.projects ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing overly permissive policies on projects
DROP POLICY IF EXISTS "Projects are publicly insertable" ON public.projects;
DROP POLICY IF EXISTS "Projects are publicly readable" ON public.projects;
DROP POLICY IF EXISTS "Projects are publicly updatable" ON public.projects;

-- Create proper RLS policies for projects
CREATE POLICY "Users can view their own projects"
ON public.projects
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can create their own projects"
ON public.projects
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
ON public.projects
FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can delete their own projects"
ON public.projects
FOR DELETE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Drop existing overly permissive policies on cost_items
DROP POLICY IF EXISTS "Cost items are publicly readable" ON public.cost_items;
DROP POLICY IF EXISTS "Cost items are publicly insertable" ON public.cost_items;
DROP POLICY IF EXISTS "Cost items are publicly updatable" ON public.cost_items;
DROP POLICY IF EXISTS "Cost items are publicly deletable" ON public.cost_items;

-- Create proper RLS policies for cost_items (based on project ownership)
CREATE POLICY "Users can view cost items of their projects"
ON public.cost_items
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = cost_items.project_id
  AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
));

CREATE POLICY "Users can create cost items for their projects"
ON public.cost_items
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = cost_items.project_id
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update cost items of their projects"
ON public.cost_items
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = cost_items.project_id
  AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
));

CREATE POLICY "Users can delete cost items of their projects"
ON public.cost_items
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = cost_items.project_id
  AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
));

-- Drop existing overly permissive policies on uploaded_files
DROP POLICY IF EXISTS "Uploaded files are publicly readable" ON public.uploaded_files;
DROP POLICY IF EXISTS "Uploaded files are publicly insertable" ON public.uploaded_files;
DROP POLICY IF EXISTS "Uploaded files are publicly updatable" ON public.uploaded_files;

-- Create proper RLS policies for uploaded_files (based on project ownership)
CREATE POLICY "Users can view files of their projects"
ON public.uploaded_files
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = uploaded_files.project_id
  AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
));

CREATE POLICY "Users can upload files to their projects"
ON public.uploaded_files
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = uploaded_files.project_id
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update files of their projects"
ON public.uploaded_files
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = uploaded_files.project_id
  AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
));

CREATE POLICY "Users can delete files of their projects"
ON public.uploaded_files
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = uploaded_files.project_id
  AND (projects.user_id = auth.uid() OR public.is_admin(auth.uid()))
));

-- RLS policies for profiles (users can only see and update their own profile, admins can see all)
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- RLS policies for user_roles (only admins can manage roles, users can see their own)
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.is_admin(auth.uid()));