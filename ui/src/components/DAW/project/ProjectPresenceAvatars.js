'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Popover from '@/components/Popover';
import { useProjectSync } from './ProjectSyncContext';
import styles from './ProjectPresenceAvatars.module.css';

const AVATAR_SIZE = 32;
const MAX_VISIBLE_WITHOUT_OVERFLOW = 5;
const VISIBLE_BEFORE_OVERFLOW = 4;

function PresenceAvatar({ user, zIndex }) {
  const anchorRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const [isPopoverVisible, setIsPopoverVisible] = useState(false);

  const showPopover = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsPopoverVisible(true);
  };

  const hidePopover = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsPopoverVisible(false);
      closeTimeoutRef.current = null;
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const label = user.username ? `@${user.username}` : 'User';

  return (
    <>
      <div
        ref={anchorRef}
        className={styles.avatarItem}
        style={{ zIndex }}
        onMouseEnter={showPopover}
        onMouseLeave={hidePopover}
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
      <Popover
        isVisible={isPopoverVisible}
        anchorElement={anchorRef.current}
        className={styles.popover}
        onMouseEnter={showPopover}
        onMouseLeave={hidePopover}
      >
        <span className={styles.popoverUsername}>{label}</span>
      </Popover>
    </>
  );
}

function OverflowAvatar({ users, zIndex }) {
  const anchorRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const [isPopoverVisible, setIsPopoverVisible] = useState(false);

  const showPopover = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsPopoverVisible(true);
  };

  const hidePopover = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsPopoverVisible(false);
      closeTimeoutRef.current = null;
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  if (users.length === 0) {
    return null;
  }

  return (
    <>
      <div
        ref={anchorRef}
        className={`${styles.avatarItem} ${styles.overflowItem}`}
        style={{ zIndex }}
        onMouseEnter={showPopover}
        onMouseLeave={hidePopover}
      >
        <div className={`avatar ${styles.avatarCircle} ${styles.overflowCircle}`}>
          <span className={styles.overflowLabel}>+{users.length}</span>
        </div>
      </div>
      <Popover
        isVisible={isPopoverVisible}
        anchorElement={anchorRef.current}
        className={styles.overflowPopover}
        onMouseEnter={showPopover}
        onMouseLeave={hidePopover}
      >
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
      </Popover>
    </>
  );
}

export default function ProjectPresenceAvatars() {
  const { onlineUsers } = useProjectSync();

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
  );
}
