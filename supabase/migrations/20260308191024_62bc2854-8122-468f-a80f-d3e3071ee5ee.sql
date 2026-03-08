
-- Team Chat: channels and messages for project-level and global collaboration

-- Chat channels table
CREATE TABLE public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Chat messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chat_messages_channel ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_chat_channels_project ON public.chat_channels(project_id);

-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS for chat_channels
-- Users can see global channels or channels for projects they own/are members of
CREATE POLICY "Users can view accessible channels"
ON public.chat_channels
FOR SELECT
TO authenticated
USING (
  is_global = true
  OR (project_id IS NOT NULL AND (
    is_project_owner(auth.uid(), project_id)
    OR is_project_member(auth.uid(), project_id)
    OR is_admin(auth.uid())
  ))
);

-- Only project owners, admins, or global admins can create channels
CREATE POLICY "Users can create channels"
ON public.chat_channels
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    is_global = false OR is_admin(auth.uid())
  ) AND (
    project_id IS NULL 
    OR is_project_owner(auth.uid(), project_id) 
    OR can_edit_project(auth.uid(), project_id) 
    OR is_admin(auth.uid())
  )
);

-- Channel creators and admins can update
CREATE POLICY "Channel owners can update"
ON public.chat_channels
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() OR is_admin(auth.uid())
);

-- Channel creators and admins can delete
CREATE POLICY "Channel owners can delete"
ON public.chat_channels
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid() OR is_admin(auth.uid())
);

-- RLS for chat_messages
-- Users can view messages in channels they have access to
CREATE POLICY "Users can view messages in accessible channels"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_channels c
    WHERE c.id = chat_messages.channel_id
    AND (
      c.is_global = true
      OR (c.project_id IS NOT NULL AND (
        is_project_owner(auth.uid(), c.project_id)
        OR is_project_member(auth.uid(), c.project_id)
        OR is_admin(auth.uid())
      ))
    )
  )
);

-- Users can send messages to accessible channels
CREATE POLICY "Users can send messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.chat_channels c
    WHERE c.id = chat_messages.channel_id
    AND (
      c.is_global = true
      OR (c.project_id IS NOT NULL AND (
        is_project_owner(auth.uid(), c.project_id)
        OR is_project_member(auth.uid(), c.project_id)
        OR is_admin(auth.uid())
      ))
    )
  )
);

-- Users can edit their own messages
CREATE POLICY "Users can edit own messages"
ON public.chat_messages
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Users can delete their own messages, admins can delete any
CREATE POLICY "Users can delete own messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
