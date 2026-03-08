import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  projectName?: string;
  isGlobal: boolean;
  createdBy: string;
  createdAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
}

export function useTeamChat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load channels
  const loadChannels = useCallback(async () => {
    setIsLoadingChannels(true);
    try {
      const { data, error } = await supabase
        .from('chat_channels')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Get project names for project channels
      const projectIds = (data || []).filter(c => c.project_id).map(c => c.project_id!);
      let projectNames: Record<string, string> = {};
      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', projectIds);
        if (projects) {
          projects.forEach(p => { projectNames[p.id] = p.name; });
        }
      }

      setChannels((data || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        projectId: c.project_id,
        projectName: c.project_id ? projectNames[c.project_id] : undefined,
        isGlobal: c.is_global,
        createdBy: c.created_by,
        createdAt: c.created_at,
      })));
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  // Load messages for active channel
  const loadMessages = useCallback(async (channelId: string) => {
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) throw error;

      // Fetch user profiles for message authors
      const userIds = [...new Set((data || []).map(m => m.user_id))];
      let profileMap: Record<string, { email: string | null; full_name: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);
        if (profiles) {
          profiles.forEach(p => { profileMap[p.id] = { email: p.email, full_name: p.full_name }; });
        }
      }

      setMessages((data || []).map(m => ({
        id: m.id,
        channelId: m.channel_id,
        userId: m.user_id,
        userEmail: profileMap[m.user_id]?.email || undefined,
        userName: profileMap[m.user_id]?.full_name || undefined,
        content: m.content,
        createdAt: m.created_at,
        editedAt: m.edited_at,
      })));
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Set active channel and load messages
  const selectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    loadMessages(channelId);
  }, [loadMessages]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!activeChannelId) return;

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`chat-${activeChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${activeChannelId}`,
        },
        async (payload) => {
          const msg = payload.new as any;
          // Don't add if it's our own message (already added optimistically)
          if (msg.user_id === user?.id) return;

          // Fetch profile for the new message author
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', msg.user_id)
            .maybeSingle();

          setMessages(prev => [...prev, {
            id: msg.id,
            channelId: msg.channel_id,
            userId: msg.user_id,
            userEmail: profile?.email || undefined,
            userName: profile?.full_name || undefined,
            content: msg.content,
            createdAt: msg.created_at,
            editedAt: msg.edited_at,
          }]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          const old = payload.old as any;
          setMessages(prev => prev.filter(m => m.id !== old.id));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeChannelId, user?.id]);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!activeChannelId || !user) return false;

    const optimisticId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Optimistic update
    setMessages(prev => [...prev, {
      id: optimisticId,
      channelId: activeChannelId,
      userId: user.id,
      userEmail: user.email || undefined,
      userName: user.user_metadata?.full_name || undefined,
      content,
      createdAt: now,
      editedAt: null,
    }]);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          channel_id: activeChannelId,
          user_id: user.id,
          content,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace optimistic message with real one
      setMessages(prev => prev.map(m => m.id === optimisticId ? {
        ...m,
        id: data.id,
        createdAt: data.created_at,
      } : m));

      return true;
    } catch (err) {
      console.error('Failed to send message:', err);
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      return false;
    }
  }, [activeChannelId, user]);

  // Create a channel
  const createChannel = useCallback(async (
    name: string,
    description?: string,
    projectId?: string,
    isGlobal = false
  ) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('chat_channels')
        .insert({
          name,
          description: description || null,
          project_id: projectId || null,
          created_by: user.id,
          is_global: isGlobal,
        })
        .select()
        .single();

      if (error) throw error;
      await loadChannels();
      return data.id;
    } catch (err) {
      console.error('Failed to create channel:', err);
      return null;
    }
  }, [user, loadChannels]);

  // Delete a message
  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return true;
    } catch (err) {
      console.error('Failed to delete message:', err);
      return false;
    }
  }, []);

  // Init: load channels
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  return {
    channels,
    messages,
    activeChannelId,
    isLoadingChannels,
    isLoadingMessages,
    selectChannel,
    sendMessage,
    createChannel,
    deleteMessage,
    loadChannels,
  };
}
