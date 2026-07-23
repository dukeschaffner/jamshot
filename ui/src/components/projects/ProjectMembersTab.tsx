'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Users, X } from 'lucide-react';
import { projectApi } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import ProjectMemberCard from './ProjectMemberCard';
import ProjectInviteSearch from './ProjectInviteSearch';
import ProjectCollabInviteDialog from './ProjectCollabInviteDialog';

type ProjectMember = {
  id: string;
  username: string;
  name?: string | null;
  profile_pic_url?: string | null;
  role: string;
  joined_at?: string;
};

type ProjectInvite = {
  id: number;
  token: string;
  role: string;
  url: string;
  expiresAt: string;
  invitedUserId: string | null;
  invitedUser: {
    id: string;
    username: string;
    name?: string | null;
    profile_pic_url?: string | null;
  } | null;
};

type ProjectMembersTabProps = {
  projectGuid: string;
  currentUserRole: string;
  sourceRootId?: number | null;
  teamId?: number | null;
  campId?: number | null;
  onMemberCountChange?: (count: number) => void;
};

export default function ProjectMembersTab({
  projectGuid,
  currentUserRole,
  sourceRootId = null,
  teamId = null,
  campId = null,
  onMemberCountChange,
}: ProjectMembersTabProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

  const loadData = useCallback(async () => {
    try {
      setError('');
      const membersRes = await projectApi.getMembers(projectGuid);
      const nextMembers = membersRes.data?.members || [];
      setMembers(nextMembers);
      onMemberCountChange?.(nextMembers.length);

      if (canManage) {
        const invitesRes = await projectApi.getInvites(projectGuid);
        setInvites(invitesRes.data?.invites || []);
      } else {
        setInvites([]);
      }
    } catch (err) {
      console.error('Failed to load project members:', err);
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [projectGuid, canManage, onMemberCountChange]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const excludedUserIds = useMemo(() => {
    const ids = new Set(members.map((m) => m.id));
    for (const invite of invites) {
      if (invite.invitedUserId) ids.add(invite.invitedUserId);
    }
    return ids;
  }, [members, invites]);

  const handleRoleUpdate = async (userId: string, role: string) => {
    setActionError('');
    try {
      await projectApi.updateMemberRole(projectGuid, userId, role);
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role } : m))
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Failed to update role';
      setActionError(message);
      throw err;
    }
  };

  const handleRemove = async (userId: string) => {
    setActionError('');
    try {
      await projectApi.removeMember(projectGuid, userId);
      setMembers((prev) => {
        const next = prev.filter((m) => m.id !== userId);
        onMemberCountChange?.(next.length);
        return next;
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Failed to remove member';
      setActionError(message);
      throw err;
    }
  };

  const handleRevokeInvite = async (inviteId: number) => {
    setActionError('');
    try {
      await projectApi.revokeInvite(projectGuid, inviteId);
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Failed to revoke invite';
      setActionError(message);
    }
  };

  const handleCopyInviteUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy invite link:', err);
    }
  };

  if (loading) {
    return (
      <div className="project-members-tab">
        <div className="project-members-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="project-member-card">
              <Skeleton className="size-10 rounded-full" />
              <div className="project-member-info" style={{ flex: 1 }}>
                <Skeleton className="mb-2 h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-members-tab">
        <p className="project-invite-error">{error}</p>
        <Button variant="outline" onClick={() => { setLoading(true); loadData(); }}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="project-members-tab">
      {canManage && (
        <ProjectInviteSearch
          projectGuid={projectGuid}
          excludedUserIds={excludedUserIds}
          teamId={teamId}
          campId={campId}
          onInviteCreated={loadData}
          extraActions={
            sourceRootId != null ? (
              <ProjectCollabInviteDialog
                projectGuid={projectGuid}
                onInvitesCreated={loadData}
              />
            ) : null
          }
        />
      )}

      {actionError && <p className="project-invite-error">{actionError}</p>}

      {canManage && invites.length > 0 && (
        <div className="project-pending-invites">
          <h3 className="project-members-section-title">Pending invites</h3>
          <div className="project-members-list">
            {invites.map((invite) => {
              const invitee = invite.invitedUser;
              const displayName = invitee
                ? invitee.name || invitee.username
                : 'Invite link';
              const initials = invitee
                ? displayName.slice(0, 2).toUpperCase()
                : 'IL';

              return (
                <div key={invite.id} className="project-member-card">
                  <div className="project-member-link">
                    {invitee ? (
                      <Avatar size="lg">
                        <AvatarImage
                          src={invitee.profile_pic_url || '/avatar.svg'}
                          alt={invitee.username}
                        />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="project-invite-link-icon">
                        <Link2 className="size-5" />
                      </div>
                    )}
                    <div className="project-member-info">
                      <div className="project-member-name">{displayName}</div>
                      <div className="project-member-handle">
                        {invitee
                          ? `@${invitee.username}`
                          : 'Anyone with the link'}
                      </div>
                    </div>
                  </div>
                  <div className="project-member-actions">
                    <Badge variant="outline">{invite.role}</Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyInviteUrl(invite.url)}
                            aria-label="Copy invite link"
                          >
                            <Copy className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy invite link</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRevokeInvite(invite.id)}
                            aria-label="Revoke invite"
                          >
                            <X className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Revoke invite</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="project-members-section">
        <h3 className="project-members-section-title">
          Members ({members.length})
        </h3>
        {members.length === 0 ? (
          <div className="project-members-empty">
            <Users className="size-8 opacity-40" />
            <p>No members yet.</p>
          </div>
        ) : (
          <div className="project-members-list">
            {members.map((member) => (
              <ProjectMemberCard
                key={member.id}
                member={member}
                currentUserRole={currentUserRole}
                onRoleUpdate={handleRoleUpdate}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
