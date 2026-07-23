'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Link2, Loader2, UserPlus } from 'lucide-react';
import { campApi, projectApi, searchApi, teamApi } from '@/lib/api';
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
  teamId?: number | null;
  campId?: number | null;
  onInviteCreated: () => void;
  extraActions?: ReactNode;
};

const INVITE_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
] as const;

function matchesQuery(user: SearchUser, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const username = (user.username || '').toLowerCase();
  const name = (user.name || '').toLowerCase();
  return username.includes(q) || name.includes(q);
}

export default function ProjectInviteSearch({
  projectGuid,
  excludedUserIds,
  teamId = null,
  campId = null,
  onInviteCreated,
  extraActions,
}: ProjectInviteSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [scopeMembers, setScopeMembers] = useState<SearchUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [inviteRole, setInviteRole] = useState('editor');
  const [linkRole, setLinkRole] = useState('editor');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const isScoped = teamId != null || campId != null;
  const searchPlaceholder = isScoped
    ? teamId != null
      ? 'Search team members…'
      : 'Search camp members…'
    : 'Search users…';

  useEffect(() => {
    if (!isScoped) {
      setScopeMembers(null);
      return;
    }

    let cancelled = false;

    const loadScopeMembers = async () => {
      try {
        let members: SearchUser[] = [];
        if (teamId != null) {
          const response = await teamApi.getMembers(teamId);
          members = (response.data?.members || []) as SearchUser[];
        } else if (campId != null) {
          const response = await campApi.getCamp(campId);
          members = (response.data?.members || []) as SearchUser[];
        }
        if (!cancelled) {
          setScopeMembers(members);
        }
      } catch (err) {
        console.error('Failed to load camp/team members for invite search:', err);
        if (!cancelled) {
          setScopeMembers([]);
        }
      }
    };

    loadScopeMembers();

    return () => {
      cancelled = true;
    };
  }, [isScoped, teamId, campId]);

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
        let users: SearchUser[] = [];

        if (isScoped) {
          const members = scopeMembers || [];
          users = members.filter((user) => matchesQuery(user, trimmed));
        } else {
          const response = await searchApi.search(trimmed, 'users');
          users = (response.data?.users || []) as SearchUser[];
        }

        if (requestId !== requestIdRef.current) return;
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
  }, [query, excludedUserIds, isScoped, scopeMembers]);

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
                placeholder={searchPlaceholder}
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
                  <CommandEmpty>
                    {isScoped
                      ? teamId != null
                        ? 'No matching team members.'
                        : 'No matching camp members.'
                      : 'No users found.'}
                  </CommandEmpty>
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
                {teamId != null
                  ? 'Shareable link — only team members can accept'
                  : campId != null
                    ? 'Shareable link — only camp members can accept'
                    : 'Create a shareable invite link and copy it'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {extraActions}
      </div>

      {error && <p className="project-invite-error">{error}</p>}
    </div>
  );
}
