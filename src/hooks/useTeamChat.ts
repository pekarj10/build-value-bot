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
  reactions: ReactionGroup[];
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  reacted: boolean; // current user reacted
}

export function useTeamChat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [mentionableUsers, setMentionableUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Last-read timestamps stored in localStorage
  const getLastRead = useCallback((channelId: string): string | null => {
    try {
      const data = JSON.parse(localStorage.getItem('chat_last_read') || '{}');
      return data[channelId] || null;
    } catch { return null; }
  }, []);

  const setLastRead = useCallback((channelId: string) => {
    try {
      const data = JSON.parse(localStorage.getItem('chat_last_read') || '{}');
      data[channelId] = new Date().toISOString();
      localStorage.setItem('chat_last_read', JSON.stringify(data));
      setUnreadCounts(prev => ({ ...prev, [channelId]: 0 }));
    } catch {}
  }, []);

  // Load channels
  const loadChannels = useCallback(async () => {
    setIsLoadingChannels(true);
    try {
      const { data, error } = await supabase
        .from('chat_channels')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

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

      const channelList = (data || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        projectId: c.project_id,
        projectName: c.project_id ? projectNames[c.project_id] : undefined,
        isGlobal: c.is_global,
        createdBy: c.created_by,
        createdAt: c.created_at,
      }));
      setChannels(channelList);

      // Compute unread counts per channel
      const counts: Record<string, number> = {};
      for (const ch of channelList) {
        const lastRead = getLastRead(ch.id);
        let query = supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', ch.id);
        if (lastRead) {
          query = query.gt('created_at', lastRead);
        }
        if (user) {
          query = query.neq('user_id', user.id);
        }
        const { count } = await query;
        counts[ch.id] = count || 0;
      }
      setUnreadCounts(counts);
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  // Load mentionable users (all profiles)
  const loadMentionableUsers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .limit(200);
      if (data) {
        setMentionableUsers(data.map(p => ({
          id: p.id,
          name: p.full_name || p.email || 'Unknown',
          email: p.email || '',
        })));
      }
    } catch (err) {
      console.error('Failed to load mentionable users:', err);
    }
  }, []);

  // Group reactions from raw rows
  const groupReactions = useCallback((rows: { emoji: string; user_id: string }[]): ReactionGroup[] => {
    const map = new Map<string, { count: number; userIds: string[] }>();
    for (const r of rows) {
      const existing = map.get(r.emoji);
      if (existing) {
        existing.count++;
        existing.userIds.push(r.user_id);
      } else {
        map.set(r.emoji, { count: 1, userIds: [r.user_id] });
      }
    }
    return Array.from(map.entries()).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      userIds: data.userIds,
      reacted: data.userIds.includes(user?.id || ''),
    }));
  }, [user?.id]);

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

      // Load reactions for all messages
      const messageIds = (data || []).map(m => m.id);
      let reactionsMap: Record<string, { emoji: string; user_id: string }[]> = {};
      if (messageIds.length > 0) {
        const { data: reactions } = await supabase
          .from('message_reactions')
          .select('message_id, emoji, user_id')
          .in('message_id', messageIds);
        if (reactions) {
          for (const r of reactions) {
            if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
            reactionsMap[r.message_id].push({ emoji: r.emoji, user_id: r.user_id });
          }
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
        reactions: groupReactions(reactionsMap[m.id] || []),
      })));
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [groupReactions]);

  const selectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    setLastRead(channelId);
    loadMessages(channelId);
  }, [loadMessages, setLastRead]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!activeChannelId) return;

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
          if (msg.user_id === user?.id) return;

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
            reactions: [],
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

    setMessages(prev => [...prev, {
      id: optimisticId,
      channelId: activeChannelId,
      userId: user.id,
      userEmail: user.email || undefined,
      userName: user.user_metadata?.full_name || undefined,
      content,
      createdAt: now,
      editedAt: null,
      reactions: [],
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

      setMessages(prev => prev.map(m => m.id === optimisticId ? {
        ...m,
        id: data.id,
        createdAt: data.created_at,
      } : m));

      return true;
    } catch (err) {
      console.error('Failed to send message:', err);
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

  // Toggle reaction on a message
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const existingReaction = msg.reactions.find(r => r.emoji === emoji);
    const alreadyReacted = existingReaction?.reacted || false;

    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      let newReactions: ReactionGroup[];
      if (alreadyReacted) {
        newReactions = m.reactions.map(r => {
          if (r.emoji !== emoji) return r;
          const newUserIds = r.userIds.filter(id => id !== user.id);
          return newUserIds.length === 0
            ? null as any
            : { ...r, count: r.count - 1, userIds: newUserIds, reacted: false };
        }).filter(Boolean);
      } else {
        const found = m.reactions.find(r => r.emoji === emoji);
        if (found) {
          newReactions = m.reactions.map(r =>
            r.emoji === emoji
              ? { ...r, count: r.count + 1, userIds: [...r.userIds, user.id], reacted: true }
              : r
          );
        } else {
          newReactions = [...m.reactions, { emoji, count: 1, userIds: [user.id], reacted: true }];
        }
      }
      return { ...m, reactions: newReactions };
    }));

    try {
      if (alreadyReacted) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('emoji', emoji);
      } else {
        await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: user.id, emoji });
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
      // Reload to get correct state
      if (activeChannelId) loadMessages(activeChannelId);
    }
  }, [user, messages, activeChannelId, loadMessages]);

  // Init
  useEffect(() => {
    loadChannels();
    loadMentionableUsers();
  }, [loadChannels, loadMentionableUsers]);

  return {
    channels,
    messages,
    activeChannelId,
    isLoadingChannels,
    isLoadingMessages,
    mentionableUsers,
    selectChannel,
    sendMessage,
    createChannel,
    deleteMessage,
    toggleReaction,
    loadChannels,
  };
}
