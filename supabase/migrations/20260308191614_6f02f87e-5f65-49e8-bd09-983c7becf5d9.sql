
-- 1. Create AI chat conversations table for persistence
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON public.ai_conversations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Users can create own conversations"
  ON public.ai_conversations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own conversations"
  ON public.ai_conversations FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Create AI chat messages table
CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  item_updates jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages of own conversations"
  ON public.ai_messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id
    AND (c.user_id = auth.uid() OR is_admin(auth.uid()))
  ));

CREATE POLICY "Users can insert messages to own conversations"
  ON public.ai_messages FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id
    AND c.user_id = auth.uid()
  ));

-- 3. Fix chat_channels SELECT policy to include channels created by the user (private non-global non-project channels)
DROP POLICY IF EXISTS "Users can view accessible channels" ON public.chat_channels;
CREATE POLICY "Users can view accessible channels"
  ON public.chat_channels FOR SELECT
  TO authenticated
  USING (
    is_global = true
    OR created_by = auth.uid()
    OR (project_id IS NOT NULL AND (
      is_project_owner(auth.uid(), project_id)
      OR is_project_member(auth.uid(), project_id)
      OR is_admin(auth.uid())
    ))
  );

-- 4. Allow authenticated users to read basic profile info for chat display
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
