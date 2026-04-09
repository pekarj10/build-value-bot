import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Users, Mail, Trash2, Crown, Loader2, MessageSquare, Link2, Copy, ExternalLink } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');

type ProjectRole = 'viewer' | 'editor' | 'admin';

interface Member {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: ProjectRole;
}

interface Invitation {
  id: string;
  email: string;
  role: ProjectRole;
  status: string;
  createdAt: string;
}

interface ShareProjectDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
}

export function ShareProjectDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
  isOwner,
}: ShareProjectDialogProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('viewer');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [createChatChannel, setCreateChatChannel] = useState(true);
  const [hasProjectChannel, setHasProjectChannel] = useState(false);

  useEffect(() => {
    if (open) {
      loadMembers();
      loadInvitations();
      checkProjectChannel();
    }
  }, [open, projectId]);

  const checkProjectChannel = async () => {
    try {
      const { data } = await supabase
        .from('chat_channels')
        .select('id')
        .eq('project_id', projectId)
        .limit(1)
        .maybeSingle();
      setHasProjectChannel(!!data);
      if (data) setCreateChatChannel(false);
    } catch {
      // ignore
    }
  };

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_members')
        .select('id, user_id, role')
        .eq('project_id', projectId);

      if (error) throw error;

      const memberProfiles: Member[] = [];
      for (const m of data || []) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', m.user_id)
          .maybeSingle();

        memberProfiles.push({
          id: m.id,
          userId: m.user_id,
          email: profile?.email || 'Unknown',
          fullName: profile?.full_name || null,
          role: m.role as ProjectRole,
        });
      }
      setMembers(memberProfiles);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInvitations = async () => {
    try {
      const { data, error } = await supabase
        .from('project_invitations')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'pending');

      if (error) throw error;

      setInvitations(
        (data || []).map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role as ProjectRole,
          status: inv.status,
          createdAt: inv.created_at,
        }))
      );
    } catch (err) {
      console.error('Failed to load invitations:', err);
    }
  };

  const handleCreateProjectChannel = async () => {
    if (!user) return;
    try {
      await supabase.from('chat_channels').insert({
        name: projectName,
        description: `Discussion channel for ${projectName}`,
        project_id: projectId,
        created_by: user.id,
        is_global: false,
      });
      setHasProjectChannel(true);
      toast.success(`Chat channel created for "${projectName}"`);
    } catch (err) {
      console.error('Failed to create project channel:', err);
    }
  };

  const handleInvite = async () => {
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    if (email === user?.email) {
      toast.error("You can't invite yourself");
      return;
    }

    setIsSending(true);
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingProfile) {
        const { error } = await supabase.from('project_members').insert({
          project_id: projectId,
          user_id: existingProfile.id,
          role,
          invited_by: user?.id,
        });

        if (error) {
          if (error.code === '23505') {
            toast.error('This user is already a member of this project');
          } else {
            throw error;
          }
        } else {
          toast.success(`${email} added as ${role}`);
          // Create project chat channel if requested
          if (createChatChannel && !hasProjectChannel) {
            await handleCreateProjectChannel();
          }
          setEmail('');
          loadMembers();
        }
      } else {
        const { error } = await supabase.from('project_invitations').insert({
          project_id: projectId,
          email,
          role,
          invited_by: user?.id!,
        });

        if (error) {
          if (error.code === '23505') {
            toast.error('An invitation is already pending for this email');
          } else {
            throw error;
          }
        } else {
          toast.success(`Invitation sent to ${email}`);
          // Create project chat channel if requested
          if (createChatChannel && !hasProjectChannel) {
            await handleCreateProjectChannel();
          }
          setEmail('');
          loadInvitations();
        }
      }
    } catch (err) {
      console.error('Failed to invite:', err);
      toast.error('Failed to send invitation');
    } finally {
      setIsSending(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    try {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      toast.success(`${memberEmail} removed from project`);
      loadMembers();
    } catch (err) {
      console.error('Failed to remove member:', err);
      toast.error('Failed to remove member');
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: ProjectRole) => {
    try {
      const { error } = await supabase
        .from('project_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
      toast.success('Role updated');
      loadMembers();
    } catch (err) {
      console.error('Failed to update role:', err);
      toast.error('Failed to update role');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('project_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;
      toast.success('Invitation cancelled');
      loadInvitations();
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      toast.error('Failed to cancel invitation');
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    return email.substring(0, 2).toUpperCase();
  };

  const roleLabels: Record<ProjectRole, string> = {
    viewer: 'Can view',
    editor: 'Can edit',
    admin: 'Full access',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Project
          </DialogTitle>
          <DialogDescription>
            Invite team members to collaborate on "{projectName}"
          </DialogDescription>
        </DialogHeader>

        {/* Invite form */}
        {isOwner && (
          <div className="space-y-3">
            <Label>Invite by email</Label>
            <div className="flex gap-2">
              <Input
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                className="flex-1"
              />
              <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={isSending || !email}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Create chat channel checkbox */}
            {!hasProjectChannel && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Checkbox
                  id="create-chat"
                  checked={createChatChannel}
                  onCheckedChange={(v) => setCreateChatChannel(!!v)}
                />
                <Label htmlFor="create-chat" className="text-sm cursor-pointer flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Create a project chat channel for team discussion
                </Label>
              </div>
            )}
            {hasProjectChannel && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Project chat channel already exists
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* Owner */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Owner</Label>
          <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {getInitials(user?.user_metadata?.full_name, user?.email || '')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.user_metadata?.full_name || 'You'}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Crown className="h-3 w-3" />
              Owner
            </Badge>
          </div>
        </div>

        {/* Members */}
        {members.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Members ({members.length})
            </Label>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(member.fullName, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {member.fullName || member.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  {isOwner ? (
                    <div className="flex items-center gap-1">
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleUpdateRole(member.id, v as ProjectRole)}
                      >
                        <SelectTrigger className="h-8 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveMember(member.id, member.email)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {roleLabels[member.role]}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Pending Invitations ({invitations.length})
            </Label>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-muted">
                      <Mail className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[inv.role]} • Pending
                    </p>
                  </div>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleCancelInvitation(inv.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
