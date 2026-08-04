'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { projectApi } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';

type CollabUser = {
  id: string;
  username: string;
  name?: string | null;
  profile_pic_url?: string | null;
  verified?: boolean;
};

type InviteRole = 'editor' | 'admin' | 'viewer';

type ProjectCollabInviteDialogProps = {
  projectGuid: string;
  onInvitesCreated?: () => void;
};

export default function ProjectCollabInviteDialog({
  projectGuid,
  onInvitesCreated,
}: ProjectCollabInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<CollabUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<InviteRole>('editor');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async ({ cursor = null, append = false }: { cursor?: string | null; append?: boolean } = {}) => {
      if (!projectGuid || loadingRef.current) return;
      loadingRef.current = true;

      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      try {
        const response = await projectApi.getProjectCollabUsers(projectGuid, {
          cursor,
          limit: 30,
        });
        const page: CollabUser[] = response.data?.users || [];
        setUsers((current) => (append ? [...current, ...page] : page));
        setNextCursor(response.data?.nextCursor ?? null);
        setError('');
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error || 'Failed to load collaborators';
        setError(message);
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [projectGuid]
  );

  useEffect(() => {
    if (!open) return;
    setUsers([]);
    setNextCursor(null);
    setSelectedIds(new Set());
    setResults([]);
    setError('');
    loadPage({ append: false });
  }, [open, loadPage]);

  useEffect(() => {
    if (!open) return;
    const el = loadMoreRef.current;
    if (!el || nextCursor == null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && nextCursor != null && !loadingRef.current) {
          loadPage({ cursor: nextCursor, append: true });
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [open, loadPage, nextCursor]);

  const toggleUser = (userId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleInvite = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    setResults([]);
    setError('');

    const outcome: string[] = [];
    for (const userId of selectedIds) {
      const user = users.find((u) => u.id === userId);
      const label = user?.username || userId;
      try {
        await projectApi.createInvite(projectGuid, { userId, role });
        outcome.push(`Invited @${label}`);
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error || 'Failed';
        outcome.push(`@${label}: ${message}`);
      }
    }

    setResults(outcome);
    setIsSubmitting(false);
    onInvitesCreated?.();

    const allSucceeded = outcome.every((line) => line.startsWith('Invited'));
    if (allSucceeded) {
      setOpen(false);
    } else {
      loadPage({ append: false });
      setSelectedIds(new Set());
    }
  };

  const inviteLabel =
    selectedIds.size > 0 ? `Invite ${selectedIds.size}` : 'Invite';

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="project-invite-search-trigger border-grey-2 bg-[var(--background)] text-[var(--text-primary)]"
        onClick={() => setOpen(true)}
      >
        <Users className="size-4" />
        Invite from collab tree
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-4 border-grey-2 bg-[var(--background)] p-6 text-[var(--text-primary)] sm:max-w-md"
          style={{ background: 'var(--background)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">
              Invite collaborators
            </DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              People who&apos;ve published a track in this collab tree.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">Invite as</span>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as InviteRole)}
            >
              <SelectTrigger className="h-8 w-[140px] border-grey-2 bg-[var(--background)] text-[var(--text-primary)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-grey-2 bg-[var(--background)] text-[var(--text-primary)]">
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-grey-2 bg-[var(--background)]">
            {isLoading && users.length === 0 ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : users.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-secondary)]">
                No collaborators left to invite from this tree.
              </p>
            ) : (
              <ul>
                {users.map((user) => {
                  const selected = selectedIds.has(user.id);
                  const displayName = user.name || user.username;
                  return (
                    <li
                      key={user.id}
                      style={{ borderBottom: '1px solid var(--grey-2)' }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                        style={{
                          background: selected ? 'var(--grey-1)' : 'transparent',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Avatar size="default">
                          <AvatarImage
                            src={user.profile_pic_url || '/avatar.svg'}
                            alt={user.username}
                          />
                          <AvatarFallback>
                            {displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {displayName}
                          </div>
                          <div
                            className="truncate text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            @{user.username}
                          </div>
                        </div>
                        <span
                          className="shrink-0 text-xs font-medium"
                          style={{
                            color: selected
                              ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {selected ? 'Selected' : 'Select'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div ref={loadMoreRef} aria-hidden style={{ height: 1 }} />
            {isLoadingMore && (
              <p
                className="p-2 text-center text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                Loading more…
              </p>
            )}
          </div>

          {error && <p className="project-invite-error">{error}</p>}
          {results.length > 0 && (
            <ul
              className="max-h-24 space-y-1 overflow-y-auto text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              {results.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-grey-2 bg-[var(--background)] text-[var(--text-primary)]"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleInvite}
              disabled={isSubmitting || selectedIds.size === 0}
            >
              {isSubmitting ? 'Sending invites…' : inviteLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
