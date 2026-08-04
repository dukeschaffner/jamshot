'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer'] as const;

type ProjectMember = {
  id: string;
  username: string;
  name?: string | null;
  profile_pic_url?: string | null;
  role: string;
};

type ProjectMemberCardProps = {
  member: ProjectMember;
  currentUserRole: string;
  onRoleUpdate: (userId: string, role: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
};

function roleBadgeVariant(role: string) {
  if (role === 'owner') return 'secondary' as const;
  if (role === 'admin') return 'outline' as const;
  return 'default' as const;
}

export default function ProjectMemberCard({
  member,
  currentUserRole,
  onRoleUpdate,
  onRemove,
}: ProjectMemberCardProps) {
  const { user: currentUser } = useUser();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;
  const isSelf = member.id === currentUser?.id;
  const targetIsOwner = member.role === 'owner';
  const targetIsAdmin = member.role === 'admin';

  const canChangeRole =
    isAdmin &&
    !isSelf &&
    !targetIsOwner &&
    !(currentUserRole === 'admin' && targetIsAdmin);

  const canRemove =
    isAdmin &&
    !isSelf &&
    !targetIsOwner &&
    !(currentUserRole === 'admin' && targetIsAdmin);

  const rolesToShow = ASSIGNABLE_ROLES.filter((role) => role !== member.role);

  const handleRoleChange = async (newRole: string) => {
    if (newRole === member.role) return;
    setBusy(true);
    try {
      await onRoleUpdate(member.id, newRole);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRemove = async () => {
    setBusy(true);
    try {
      await onRemove(member.id);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const displayName = member.name || member.username;
  const initials = (displayName || '?').slice(0, 2).toUpperCase();

  return (
    <>
      <div className="project-member-card">
        <Link href={`/user/${member.username}`} className="project-member-link">
          <Avatar size="lg">
            <AvatarImage
              src={member.profile_pic_url || '/avatar.svg'}
              alt={member.username}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="project-member-info">
            <div className="project-member-name">{displayName}</div>
            <div className="project-member-handle">@{member.username}</div>
          </div>
        </Link>

        <div className="project-member-actions">
          {canChangeRole && rolesToShow.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy}>
                  {ROLE_LABELS[member.role] || member.role}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {rolesToShow.map((role) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => handleRoleChange(role)}
                    disabled={busy}
                  >
                    {ROLE_LABELS[role]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Badge variant={roleBadgeVariant(member.role)}>
              {ROLE_LABELS[member.role] || member.role}
            </Badge>
          )}

          {canRemove && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmOpen(true)}
                    disabled={busy}
                    aria-label={`Remove ${displayName}`}
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove member</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {displayName} (@{member.username}){' '}
              from this project? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={busy}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
