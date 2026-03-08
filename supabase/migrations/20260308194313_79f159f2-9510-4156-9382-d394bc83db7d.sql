
-- Create message_reactions table
CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Users can view reactions on messages they can see
CREATE POLICY "Users can view reactions"
ON public.message_reactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chat_messages cm
    JOIN chat_channels c ON c.id = cm.channel_id
    WHERE cm.id = message_reactions.message_id
    AND (
      c.is_global = true
      OR c.created_by = auth.uid()
      OR (c.project_id IS NOT NULL AND (
        is_project_owner(auth.uid(), c.project_id)
        OR is_project_member(auth.uid(), c.project_id)
        OR is_admin(auth.uid())
      ))
    )
  )
);

-- Users can add reactions
CREATE POLICY "Users can add reactions"
ON public.message_reactions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can remove their own reactions
CREATE POLICY "Users can remove own reactions"
ON public.message_reactions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
