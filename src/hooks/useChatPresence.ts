import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PresenceState {
  id: string;
  name: string;
  email: string;
  channelId: string | null;
  isTyping: boolean;
  lastSeen: string;
}

export function useChatPresence(activeChannelId: string | null) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const presenceChannel = supabase.channel('chat-presence', {
      config: {
        presence: { key: user.id },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<PresenceState>();
        const users: PresenceState[] = [];
        for (const [, presences] of Object.entries(state)) {
          if (presences.length > 0) {
            users.push(presences[0] as PresenceState);
          }
        }
        setOnlineUsers(users);

        // Compute typing users for current channel
        if (activeChannelId) {
          const typing = users
            .filter(u => u.id !== user.id && u.channelId === activeChannelId && u.isTyping)
            .map(u => u.name || u.email || 'Someone');
          setTypingUsers(typing);
        } else {
          setTypingUsers([]);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            id: user.id,
            name: user.user_metadata?.full_name || '',
            email: user.email || '',
            channelId: activeChannelId,
            isTyping: false,
            lastSeen: new Date().toISOString(),
          });
        }
      });

    channelRef.current = presenceChannel;

    return () => {
      supabase.removeChannel(presenceChannel);
      channelRef.current = null;
    };
  }, [user, activeChannelId]);

  // Update presence when channel changes
  useEffect(() => {
    if (!channelRef.current || !user) return;

    channelRef.current.track({
      id: user.id,
      name: user.user_metadata?.full_name || '',
      email: user.email || '',
      channelId: activeChannelId,
      isTyping: false,
      lastSeen: new Date().toISOString(),
    });
  }, [activeChannelId, user]);

  // Signal typing
  const setTyping = useCallback((isTyping: boolean) => {
    if (!channelRef.current || !user) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    channelRef.current.track({
      id: user.id,
      name: user.user_metadata?.full_name || '',
      email: user.email || '',
      channelId: activeChannelId,
      isTyping,
      lastSeen: new Date().toISOString(),
    });

    // Auto-stop typing after 3 seconds
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        if (channelRef.current && user) {
          channelRef.current.track({
            id: user.id,
            name: user.user_metadata?.full_name || '',
            email: user.email || '',
            channelId: activeChannelId,
            isTyping: false,
            lastSeen: new Date().toISOString(),
          });
        }
      }, 3000);
    }
  }, [user, activeChannelId]);

  // Get online count for current channel
  const onlineInChannel = activeChannelId
    ? onlineUsers.filter(u => u.channelId === activeChannelId).length
    : 0;

  return {
    onlineUsers,
    onlineInChannel,
    typingUsers,
    setTyping,
    totalOnline: onlineUsers.length,
  };
}
