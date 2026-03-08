import { useState, useRef, useEffect } from 'react';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { useTeamChat, ChatChannel, ChatMessage } from '@/hooks/useTeamChat';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';

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

export default function TeamChat() {
  const { user, isAdmin } = useAuth();
  const {
    channels,
    messages,
    activeChannelId,
    isLoadingChannels,
    isLoadingMessages,
    selectChannel,
    sendMessage,
    createChannel,
    deleteMessage,
  } = useTeamChat();

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelGlobal, setNewChannelGlobal] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-select first channel
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      selectChannel(channels[0].id);
    }
  }, [channels, activeChannelId, selectChannel]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput('');
    setIsSending(true);
    const ok = await sendMessage(text);
    if (!ok) toast.error('Failed to send message');
    setIsSending(false);
    inputRef.current?.focus();
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
            <div className="p-3 border-b">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Channels
              </h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {isLoadingChannels ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))
                ) : channels.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No channels yet. Create one to start chatting!
                  </div>
                ) : (
                  channels.map(channel => (
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
                      <span className="truncate">{channel.name}</span>
                    </button>
                  ))
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
                {activeChannel.isGlobal && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    <Globe className="h-3 w-3 mr-1" />
                    Global
                  </Badge>
                )}
                {activeChannel.projectName && (
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    <FolderOpen className="h-3 w-3 mr-1" />
                    {activeChannel.projectName}
                  </Badge>
                )}
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
                <div className="space-y-4">
                  {messages.map((msg, i) => {
                    const isOwnMessage = msg.userId === user?.id;
                    const showAvatar = i === 0 || messages[i - 1]?.userId !== msg.userId;

                    return (
                      <div key={msg.id} className={cn("group flex gap-3", !showAvatar && "ml-10")}>
                        {showAvatar && (
                          <Avatar className="h-8 w-8 shrink-0">
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
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                            {isOwnMessage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                onClick={() => deleteMessage(msg.id)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
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

            {/* Input */}
            {activeChannelId && (
              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={`Message #${activeChannel?.name || 'channel'}...`}
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
