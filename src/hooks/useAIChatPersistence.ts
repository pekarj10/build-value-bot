import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  itemUpdates?: any[];
}

export interface Conversation {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export function useAIChatPersistence(projectId: string, userId: string | undefined) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const conversationCreating = useRef(false);

  // Load or create conversation for this project
  const loadOrCreateConversation = useCallback(async (): Promise<{ id: string; messages: PersistedMessage[] }> => {
    if (!userId) return { id: '', messages: [] };

    setIsLoadingHistory(true);
    try {
      // Check for existing conversation
      const { data: existing } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        setConversationId(existing.id);
        
        // Load messages
        const { data: msgs } = await supabase
          .from('ai_messages')
          .select('*')
          .eq('conversation_id', existing.id)
          .order('created_at', { ascending: true });

        const messages: PersistedMessage[] = (msgs || []).map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: m.created_at,
          itemUpdates: m.item_updates as any[] | undefined,
        }));

        return { id: existing.id, messages };
      }

      // Create new conversation
      const { data: newConv, error } = await supabase
        .from('ai_conversations')
        .insert({ project_id: projectId, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      setConversationId(newConv.id);
      return { id: newConv.id, messages: [] };
    } catch (err) {
      console.error('Failed to load/create conversation:', err);
      return { id: '', messages: [] };
    } finally {
      setIsLoadingHistory(false);
    }
  }, [projectId, userId]);

  // Persist a message
  const persistMessage = useCallback(async (
    convId: string,
    role: 'user' | 'assistant',
    content: string,
    itemUpdates?: any[]
  ): Promise<string | null> => {
    if (!convId) return null;
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: convId,
          role,
          content,
          item_updates: itemUpdates || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Update conversation timestamp
      await supabase
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId);

      return data.id;
    } catch (err) {
      console.error('Failed to persist message:', err);
      return null;
    }
  }, []);

  // Clear conversation (start fresh)
  const clearConversation = useCallback(async () => {
    if (!conversationId) return;
    try {
      await supabase
        .from('ai_conversations')
        .delete()
        .eq('id', conversationId);
      setConversationId(null);
    } catch (err) {
      console.error('Failed to clear conversation:', err);
    }
  }, [conversationId]);

  return {
    conversationId,
    isLoadingHistory,
    loadOrCreateConversation,
    persistMessage,
    clearConversation,
  };
}
