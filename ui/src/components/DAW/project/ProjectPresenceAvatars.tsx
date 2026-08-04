'use client';

import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProjectSync } from './ProjectSyncContext';
import styles from './ProjectPresenceAvatars.module.css';

const AVATAR_SIZE = 32;
const MAX_VISIBLE_WITHOUT_OVERFLOW = 5;
const VISIBLE_BEFORE_OVERFLOW = 4;

type ProjectPresenceUser = {
  userId: string;
  username?: string | null;
  profilePicUrl?: string | null;
};

type PresenceAvatarProps = {
  user: ProjectPresenceUser;
  zIndex: number;
};

function PresenceAvatar({ user, zIndex }: PresenceAvatarProps) {
  const label = user.username ? `@${user.username}` : 'User';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={styles.avatarItem}
          style={{ zIndex }}
        >
          <div className={`avatar ${styles.avatarCircle}`}>
            <Image
              src={user.profilePicUrl || '/avatar.svg'}
              alt={user.username || 'User'}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              className={styles.avatarImage}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <span>{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

type OverflowAvatarProps = {
  users: ProjectPresenceUser[];
  zIndex: number;
};

function OverflowAvatar({ users, zIndex }: OverflowAvatarProps) {
  if (users.length === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`${styles.avatarItem} ${styles.overflowItem}`}
          style={{ zIndex }}
        >
          <div className={`avatar ${styles.avatarCircle} ${styles.overflowCircle}`}>
            <span className={styles.overflowLabel}>+{users.length}</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="min-w-[180px] px-0 py-2">
        <ul className={styles.overflowList}>
          {users.map((user) => (
            <li key={user.userId} className={styles.overflowRow}>
              <div className={`avatar ${styles.overflowRowAvatar}`}>
                <Image
                  src={user.profilePicUrl || '/avatar.svg'}
                  alt={user.username || 'User'}
                  width={AVATAR_SIZE}
                  height={AVATAR_SIZE}
                  className={styles.avatarImage}
                />
              </div>
              <span className={styles.overflowRowName}>
                @{user.username || 'user'}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export default function ProjectPresenceAvatars() {
  const { onlineUsers = [] } = useProjectSync() as {
    onlineUsers: ProjectPresenceUser[];
  };

  if (!onlineUsers.length) {
    return null;
  }

  const useOverflow = onlineUsers.length > MAX_VISIBLE_WITHOUT_OVERFLOW;
  const visibleUsers = useOverflow
    ? onlineUsers.slice(0, VISIBLE_BEFORE_OVERFLOW)
    : onlineUsers;
  const overflowUsers = useOverflow
    ? onlineUsers.slice(VISIBLE_BEFORE_OVERFLOW)
    : [];

  return (
    <TooltipProvider delayDuration={150}>
      <div className={styles.stack} aria-label={`${onlineUsers.length} users online`}>
        {visibleUsers.map((user, index) => (
          <PresenceAvatar
            key={user.userId}
            user={user}
            zIndex={index + 1}
          />
        ))}
        {useOverflow && (
          <OverflowAvatar
            users={overflowUsers}
            zIndex={visibleUsers.length + 1}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
