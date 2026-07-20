'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Link2, Loader2, UserPlus } from 'lucide-react';
import { projectApi, searchApi } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type SearchUser = {
  id: string;
  username: string;
  name?: string | null;
  profile_pic_url?: string | null;
};

type ProjectInviteSearchProps = {
  projectGuid: string;
  excludedUserIds: Set<string>;
  onInviteCreated: () => void;
};

const INVITE_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
] as const;

export default function ProjectInviteSearch({
  projectGuid,
  excludedUserIds,
  onInviteCreated,
}: ProjectInviteSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteRole, setInviteRole] = useState('editor');
  const [linkRole, setLinkRole] = useState('editor');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const response = await searchApi.search(trimmed, 'users');
        if (requestId !== requestIdRef.current) return;
        const users = (response.data?.users || []) as SearchUser[];
        setResults(users.filter((user) => !excludedUserIds.has(user.id)));
      } catch (err) {
        console.error('User search failed:', err);
        if (requestId === requestIdRef.current) {
          setResults([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, excludedUserIds]);

  const handleInviteUser = async (user: SearchUser) => {
    setError('');
    setInvitingId(user.id);
    try {
      await projectApi.createInvite(projectGuid, {
        userId: user.id,
        role: inviteRole,
      });
      setOpen(false);
      setQuery('');
      setResults([]);
      onInviteCreated();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Failed to send invite';
      setError(message);
    } finally {
      setInvitingId(null);
    }
  };

  const handleCopyInviteLink = async () => {
    setError('');
    setCopying(true);
    setCopied(false);
    try {
      const response = await projectApi.createInvite(projectGuid, {
        role: linkRole,
      });
      const url = response.data?.invite?.url;
      if (!url) {
        throw new Error('Invite URL missing');
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onInviteCreated();
      setTimeout(() => setCopied(false), 2000);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Failed to create invite link';
      setError(message);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="project-invite-controls">
      <div className="project-invite-row">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="project-invite-search-trigger">
              <UserPlus className="size-4" />
              Invite by username
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[360px] border-grey-2 bg-[var(--background)] p-0 text-[var(--text-primary)] shadow-md"
            align="start"
          >
            <div className="project-invite-role-bar">
              <span className="project-invite-role-label">Invite as</span>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-8 w-[120px] border-grey-2 bg-[var(--background)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-grey-2 bg-[var(--background)] text-[var(--text-primary)]">
                  {INVITE_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Command
              shouldFilter={false}
              className="bg-[var(--background)] text-[var(--text-primary)]"
            >
              <CommandInput
                placeholder="Search users…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {searching && (
                  <div className="project-invite-searching">
                    <Loader2 className="size-4 animate-spin" />
                    Searching…
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <CommandEmpty>No users found.</CommandEmpty>
                )}
                {!searching && results.length > 0 && (
                  <CommandGroup>
                    {results.map((user) => {
                      const displayName = user.name || user.username;
                      const initials = displayName.slice(0, 2).toUpperCase();
                      return (
                        <CommandItem
                          key={user.id}
                          value={user.username}
                          onSelect={() => handleInviteUser(user)}
                          disabled={invitingId === user.id}
                        >
                          <Avatar size="sm">
                            <AvatarImage
                              src={user.profile_pic_url || '/avatar.svg'}
                              alt={user.username}
                            />
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div className="project-invite-result-text">
                            <span className="project-invite-result-name">
                              {displayName}
                            </span>
                            <span className="project-invite-result-handle">
                              @{user.username}
                            </span>
                          </div>
                          {invitingId === user.id ? (
                            <Loader2 className="ml-auto size-4 animate-spin" />
                          ) : (
                            <UserPlus className="ml-auto size-4 opacity-50" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="project-invite-link-group">
          <Select value={linkRole} onValueChange={setLinkRole}>
            <SelectTrigger className="h-9 w-[120px] border-grey-2 bg-[var(--background)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-grey-2 bg-[var(--background)] text-[var(--text-primary)]">
              {INVITE_ROLES.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  onClick={handleCopyInviteLink}
                  disabled={copying}
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : copying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link2 className="size-4" />
                  )}
                  {copied ? 'Copied' : 'Copy invite link'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Create a shareable invite link and copy it
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {error && <p className="project-invite-error">{error}</p>}
    </div>
  );
}
