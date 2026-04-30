import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { teamMembersApi, type TeamMember, type TeamMemberRole } from '@/services/api';

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  owner: 'team.owner',
  admin: 'team.admin',
  editor: 'team.editor',
  viewer: 'team.viewer',
};

const ROLE_COLORS: Record<TeamMemberRole, string> = {
  owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  editor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

interface TeamMembersManagerProps {
  projectId: number;
}

export function TeamMembersManager({ projectId }: TeamMembersManagerProps) {
  const { t } = useTranslation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMemberRole>('viewer');

  const { data: members, isLoading } = useQuery({
    queryKey: ['team-members', projectId],
    queryFn: () => teamMembersApi.list(projectId),
  });

  const inviteMutation = useToastMutation({
    mutationFn: ({ email, role }: { email: string; role: TeamMemberRole }) =>
      teamMembersApi.invite(projectId, email, role),
    successMessage: t('team.inviteSuccess'),
    errorMessage: t('common.saveFailed'),
    invalidateKeys: [['team-members', projectId]],
    onSuccess: () => {
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
    },
  });

  const updateRoleMutation = useToastMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: TeamMemberRole }) =>
      teamMembersApi.updateRole(projectId, memberId, role),
    successMessage: t('team.roleUpdated'),
    invalidateKeys: [['team-members', projectId]],
  });

  const removeMutation = useToastMutation({
    mutationFn: (memberId: number) => teamMembersApi.remove(projectId, memberId),
    successMessage: t('team.memberRemoved'),
    invalidateKeys: [['team-members', projectId]],
  });

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const handleRoleChange = (member: TeamMember, newRole: TeamMemberRole) => {
    updateRoleMutation.mutate({ memberId: member.id, role: newRole });
  };

  const handleRemove = (member: TeamMember) => {
    removeMutation.mutate(member.id);
  };

  if (isLoading) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (!members || members.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            {t('team.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Users}
            title={t('team.noMembers')}
            description={t('team.noMembersDesc')}
            action={
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus className="mr-2 size-4" />
                {t('team.inviteFirst')}
              </Button>
            }
          />
          <InviteDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            email={inviteEmail}
            onEmailChange={setInviteEmail}
            role={inviteRole}
            onRoleChange={setInviteRole}
            onInvite={handleInvite}
            isPending={inviteMutation.isPending}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5" />
          {t('team.title')}
          <Badge variant="secondary">{members.length}</Badge>
        </CardTitle>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-1.5 size-4" />
          {t('team.invite')}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              onRoleChange={handleRoleChange}
              onRemove={handleRemove}
              isUpdating={updateRoleMutation.isPending}
              isRemoving={removeMutation.isPending}
              t={t}
            />
          ))}
        </div>
      </CardContent>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        email={inviteEmail}
        onEmailChange={setInviteEmail}
        role={inviteRole}
        onRoleChange={setInviteRole}
        onInvite={handleInvite}
        isPending={inviteMutation.isPending}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Member Row
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  onRoleChange,
  onRemove,
  isUpdating,
  isRemoving,
  t,
}: {
  member: TeamMember;
  onRoleChange: (member: TeamMember, role: TeamMemberRole) => void;
  onRemove: (member: TeamMember) => void;
  isUpdating: boolean;
  isRemoving: boolean;
  t: (key: string) => string;
}) {
  const isOwner = member.role === 'owner';

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-medium">
          {member.email[0].toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{member.email}</p>
          <p className="text-xs text-muted-foreground">
            {member.status === 'active' ? t('team.active') : member.status}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge className={ROLE_COLORS[member.role]}>
          {t(ROLE_LABELS[member.role])}
        </Badge>

        {!isOwner && (
          <>
            <Select
              value={member.role}
              onValueChange={(v) => onRoleChange(member, v as TeamMemberRole)}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">{t('team.viewer')}</SelectItem>
                <SelectItem value="editor">{t('team.editor')}</SelectItem>
                <SelectItem value="admin">{t('team.admin')}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(member)}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4 text-muted-foreground" />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite Dialog
// ---------------------------------------------------------------------------

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onEmailChange: (email: string) => void;
  role: TeamMemberRole;
  onRoleChange: (role: TeamMemberRole) => void;
  onInvite: () => void;
  isPending: boolean;
}

function InviteDialog({
  open,
  onOpenChange,
  email,
  onEmailChange,
  role,
  onRoleChange,
  onInvite,
  isPending,
}: InviteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('team.inviteTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t('team.email')}
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder={t('team.emailPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onInvite();
              }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t('team.role')}
            </label>
            <Select value={role} onValueChange={(v) => onRoleChange(v as TeamMemberRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">{t('team.viewer')}</SelectItem>
                <SelectItem value="editor">{t('team.editor')}</SelectItem>
                <SelectItem value="admin">{t('team.admin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onInvite} disabled={isPending || !email.trim()}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {t('team.invite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
