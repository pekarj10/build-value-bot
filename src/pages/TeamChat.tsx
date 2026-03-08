import { useState, useRef, useEffect, useMemo } from 'react';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { useTeamChat, ChatMessage } from '@/hooks/useTeamChat';
import { useChatPresence } from '@/hooks/useChatPresence';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Hash,
  Globe,
  FolderOpen,
  Send,
  Plus,
  Loader2,
  MessageSquare,
  Trash2,
  Users,
  Search,
  SmilePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '💯'];

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
  return format(date, 'MMM d, HH:mm');
}

function getInitials(name?: string, email?: string): string {
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (email) return email.substring(0, 2).toUpperCase();
  return 'U';
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMMM d');
}

function shouldShowDateSeparator(messages: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(messages[index].createdAt).toDateString();
  const prev = new Date(messages[index - 1].createdAt).toDateString();
  return curr !== prev;
}

// Render message content with @mentions highlighted
function renderContent(content: string) {
  const parts = content.split(/(@\w[\w\s]*?(?=\s@|\s|$))/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="bg-primary/15 text-primary rounded px-1 font-medium">
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function TeamChat() {
  const { user, isAdmin } = useAuth();
  const {
    channels,
    messages,
    activeChannelId,
    isLoadingChannels,
    isLoadingMessages,
    mentionableUsers,
    unreadCounts,
    selectChannel,
    sendMessage,
    createChannel,
    deleteMessage,
    toggleReaction,
  } = useTeamChat();

  const { onlineUsers, onlineInChannel, typingUsers, setTyping, totalOnline } = useChatPresence(activeChannelId);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelGlobal, setNewChannelGlobal] = useState(true);
  const [channelSearch, setChannelSearch] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      selectChannel(channels[0].id);
    }
  }, [channels, activeChannelId, selectChannel]);

  // Mention filtering
  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers
      .filter(u => u.id !== user?.id)
      .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionQuery, mentionableUsers, user?.id]);

  const handleInputChange = (val: string) => {
    setInput(val);
    // Signal typing
    if (val.trim()) {
      setTyping(true);
    } else {
      setTyping(false);
    }
    // Detect @mention
    const cursor = inputRef.current?.selectionStart || val.length;
    const textBefore = val.substring(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (userName: string) => {
    const cursor = inputRef.current?.selectionStart || input.length;
    const textBefore = input.substring(0, cursor);
    const textAfter = input.substring(cursor);
    const newBefore = textBefore.replace(/@\w*$/, `@${userName} `);
    setInput(newBefore + textAfter);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput('');
    setMentionQuery(null);
    setTyping(false);
    setIsSending(true);
    const ok = await sendMessage(text);
    if (!ok) toast.error('Failed to send message');
    setIsSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    const id = await createChannel(newChannelName.trim(), newChannelDesc.trim() || undefined, undefined, newChannelGlobal);
    if (id) {
      toast.success('Channel created');
      setShowNewChannel(false);
      setNewChannelName('');
      setNewChannelDesc('');
      selectChannel(id);
    } else {
      toast.error('Failed to create channel');
    }
  };

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const filteredChannels = channelSearch
    ? channels.filter(c => c.name.toLowerCase().includes(channelSearch.toLowerCase()))
    : channels;

  return (
    <AppLayout>
      <PageHeader
        title="Team Chat"
        description="Collaborate with your team in real-time"
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Team Chat' }]}
        actions={
          <Button onClick={() => setShowNewChannel(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Channel
          </Button>
        }
      />

      <div className="p-4 md:p-8">
        <Card className="flex h-[calc(100vh-220px)] min-h-[500px] overflow-hidden">
          {/* Channel sidebar */}
          <div className="w-64 border-r flex flex-col shrink-0">
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Channels
                </h3>
                {totalOnline > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    {totalOnline} online
                  </span>
                )}
              </div>
              {channels.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    placeholder="Search..."
                    className="h-7 text-xs pl-7"
                  />
                </div>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {isLoadingChannels ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))
                ) : filteredChannels.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {channelSearch ? 'No channels match your search' : 'No channels yet. Create one to start chatting!'}
                  </div>
                ) : (
                  filteredChannels.map(channel => {
                    const unread = unreadCounts[channel.id] || 0;
                    return (
                      <button
                        key={channel.id}
                        onClick={() => selectChannel(channel.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                          activeChannelId === channel.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {channel.isGlobal ? (
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                        ) : channel.projectId ? (
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Hash className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate flex-1">{channel.name}</span>
                        {unread > 0 && (
                          <Badge className="h-5 min-w-5 flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold bg-primary text-primary-foreground">
                            {unread > 99 ? '99+' : unread}
                          </Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Channel header */}
            {activeChannel ? (
              <div className="p-3 border-b flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {activeChannel.isGlobal ? (
                    <Globe className="h-4 w-4 text-primary" />
                  ) : (
                    <Hash className="h-4 w-4 text-primary" />
                  )}
                  <h3 className="font-semibold text-sm">{activeChannel.name}</h3>
                </div>
                {activeChannel.description && (
                  <span className="text-xs text-muted-foreground truncate">
                    {activeChannel.description}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {onlineInChannel > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      {onlineInChannel} here
                    </span>
                  )}
                  {activeChannel.isGlobal && (
                    <Badge variant="secondary" className="text-[10px]">
                      <Globe className="h-3 w-3 mr-1" />
                      Global
                    </Badge>
                  )}
                  {activeChannel.projectName && (
                    <Badge variant="outline" className="text-[10px]">
                      <FolderOpen className="h-3 w-3 mr-1" />
                      {activeChannel.projectName}
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 border-b">
                <span className="text-sm text-muted-foreground">Select a channel</span>
              </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !activeChannelId ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Users className="h-12 w-12 opacity-30" />
                  <p className="text-sm">Select a channel or create one to start chatting</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 opacity-30" />
                  <p className="text-sm">No messages yet. Be the first to say something!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {messages.map((msg, i) => {
                    const isOwnMessage = msg.userId === user?.id;
                    const showAvatar = i === 0 || messages[i - 1]?.userId !== msg.userId ||
                      shouldShowDateSeparator(messages, i);
                    const showDate = shouldShowDateSeparator(messages, i);

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex items-center gap-3 my-4">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] text-muted-foreground font-medium px-2">
                              {formatDateSeparator(msg.createdAt)}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <div className={cn("group flex gap-3 py-1 hover:bg-muted/30 rounded px-2 -mx-2", !showAvatar && "ml-10")}>
                          {showAvatar && (
                            <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                              <AvatarFallback className={cn(
                                "text-xs",
                                isOwnMessage ? "bg-primary text-primary-foreground" : "bg-muted"
                              )}>
                                {getInitials(msg.userName, msg.userEmail)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className="flex-1 min-w-0">
                            {showAvatar && (
                              <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="text-sm font-medium">
                                  {msg.userName || msg.userEmail || 'Unknown'}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatMessageTime(msg.createdAt)}
                                </span>
                                {msg.editedAt && (
                                  <span className="text-[10px] text-muted-foreground italic">(edited)</span>
                                )}
                              </div>
                            )}
                            <div className="flex items-start gap-1">
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words flex-1">
                                {renderContent(msg.content)}
                              </p>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                      <SmilePlus className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-2" side="top" align="end">
                                    <div className="flex gap-1">
                                      {QUICK_EMOJIS.map(emoji => (
                                        <button
                                          key={emoji}
                                          onClick={() => toggleReaction(msg.id, emoji)}
                                          className="hover:bg-muted p-1 rounded text-base transition-colors"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                {isOwnMessage && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => deleteMessage(msg.id)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {/* Reactions */}
                            {msg.reactions.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {msg.reactions.map(r => (
                                  <button
                                    key={r.emoji}
                                    onClick={() => toggleReaction(msg.id, r.emoji)}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors",
                                      r.reacted
                                        ? "bg-primary/10 border-primary/30 text-primary"
                                        : "bg-muted/50 border-border hover:bg-muted"
                                    )}
                                  >
                                    <span>{r.emoji}</span>
                                    <span className="font-medium">{r.count}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input with @mention dropdown */}
            {activeChannelId && (
              <div className="p-3 border-t relative">
                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="absolute -top-6 left-3 right-3 text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse">
                    <span className="flex gap-0.5">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                      <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                      <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                    </span>
                    <span>
                      {typingUsers.length === 1
                        ? `${typingUsers[0]} is typing...`
                        : typingUsers.length === 2
                          ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
                          : `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`}
                    </span>
                  </div>
                )}
                {/* Mention autocomplete */}
                {mentionQuery !== null && filteredMentions.length > 0 && (
                  <div className="absolute bottom-full left-3 right-3 mb-1 bg-popover border rounded-md shadow-lg z-10 overflow-hidden">
                    {filteredMentions.map((u, idx) => (
                      <button
                        key={u.id}
                        onClick={() => insertMention(u.name)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                          idx === mentionIndex ? "bg-accent" : "hover:bg-muted"
                        )}
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[8px]">
                            {getInitials(u.name, u.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{u.name}</span>
                        {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message #${activeChannel?.name || 'channel'}... (type @ to mention)`}
                    disabled={isSending}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isSending}
                    size="icon"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* New Channel Dialog */}
      <Dialog open={showNewChannel} onOpenChange={setShowNewChannel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
            <DialogDescription>
              Create a new chat channel for your team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Channel Name</Label>
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="e.g. general, project-updates"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()}
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={newChannelDesc}
                onChange={(e) => setNewChannelDesc(e.target.value)}
                placeholder="What is this channel about?"
                rows={2}
              />
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="global-channel"
                  checked={newChannelGlobal}
                  onChange={(e) => setNewChannelGlobal(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="global-channel" className="text-sm cursor-pointer">
                  Global channel (visible to all users)
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewChannel(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChannel} disabled={!newChannelName.trim()}>
              Create Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
