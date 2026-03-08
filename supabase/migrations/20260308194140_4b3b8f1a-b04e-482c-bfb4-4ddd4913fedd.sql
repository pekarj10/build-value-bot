
-- Fix 1: Allow users to update their own ai_conversations (for updated_at timestamp)
CREATE POLICY "Users can update own conversations"
ON public.ai_conversations
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Fix 2: Allow sending messages in private (non-global, non-project) channels created by the user
DROP POLICY IF EXISTS "Users can send messages" ON public.chat_messages;
CREATE POLICY "Users can send messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM chat_channels c
    WHERE c.id = chat_messages.channel_id
    AND (
      c.is_global = true
      OR (c.project_id IS NOT NULL AND (
        is_project_owner(auth.uid(), c.project_id)
        OR is_project_member(auth.uid(), c.project_id)
        OR is_admin(auth.uid())
      ))
      OR (c.created_by = auth.uid())
    )
  )
);

-- Fix 3: Allow viewing messages in private channels created by the user
DROP POLICY IF EXISTS "Users can view messages in accessible channels" ON public.chat_messages;
CREATE POLICY "Users can view messages in accessible channels"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chat_channels c
    WHERE c.id = chat_messages.channel_id
    AND (
      c.is_global = true
      OR (c.created_by = auth.uid())
      OR (c.project_id IS NOT NULL AND (
        is_project_owner(auth.uid(), c.project_id)
        OR is_project_member(auth.uid(), c.project_id)
        OR is_admin(auth.uid())
      ))
    )
  )
);
