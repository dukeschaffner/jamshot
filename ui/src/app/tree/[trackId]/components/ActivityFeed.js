'use client';

import Image from 'next/image';
import TimeDisplay from '../../../../components/TimeDisplay';
import { FaMusic, FaUser, FaCheckCircle } from 'react-icons/fa';
import styles from './ActivityFeed.module.css';

const ActivityFeed = ({ tracks = [] }) => {
  if (!tracks || tracks.length === 0) {
    return (
      <div className={styles.activityFeed}>
        <h3 className={styles.title}>Activity Feed</h3>
        <div className={styles.emptyState}>
          <FaMusic className={styles.emptyIcon} />
          <p className={styles.emptyText}>No recent activity</p>
          <p className={styles.emptySubtext}>New tracks will appear here as they're discovered</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.activityFeed}>
      <h3 className={styles.title}>Activity Feed</h3>
      <div className={styles.trackList}>
        {tracks.map((track) => (
          <div key={track.id} className={styles.trackCard}>
            <div className={styles.cardContent}>
              <div className={styles.avatarWrapper}>
                <div className={styles.avatarCircle}>
                  <Image
                    src={track?.profile_pic_url || '/avatar.svg'}
                    alt={track?.username || 'Artist'}
                    width={40}
                    height={40}
                    className={styles.avatarImg}
                  />
                </div>
                {track?.verified && (
                  <div className={styles.verifiedBadge}>
                    <FaCheckCircle size={14} />
                  </div>
                )}
              </div>
              <div className={styles.trackInfo}>
                <div className={styles.trackTitle}>{track.title}</div>
                <div className={styles.trackMeta}>
                  <span className={styles.username}>
                    <FaUser className={styles.userIcon} />
                    {track.username}
                  </span>
                  <TimeDisplay 
                    timestamp={track.created_at}
                    className={styles.timestamp}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityFeed;