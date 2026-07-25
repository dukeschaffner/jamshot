'use client';

import Image from 'next/image';
import { FaCheckCircle } from 'react-icons/fa';
import styles from './TrackContributorAvatar.module.css';

export default function TrackContributorAvatar({
  profilePicUrl,
  username,
  verified = false,
  size = 24,
}) {
  const badgeSize = Math.round(size * 0.42);

  return (
    <div
      className={styles.avatarWrapper}
      style={{ width: size, height: size }}
      title={username || undefined}
    >
      <div className={styles.avatarImageRing}>
        <Image
          src={profilePicUrl || '/avatar.svg'}
          alt={username || 'Artist'}
          width={size}
          height={size}
          className={styles.avatarImage}
        />
      </div>
      {verified && (
        <div
          className={styles.verifiedBadge}
          style={{ width: badgeSize, height: badgeSize }}
        >
          <FaCheckCircle size={badgeSize - 1} />
        </div>
      )}
    </div>
  );
}
