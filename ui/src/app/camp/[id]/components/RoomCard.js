'use client';
import { FaDoorOpen, FaUsers, FaMusic } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function RoomCard({ room, onClick }) {
  const memberCount = room.members?.length || 0;
  const trackCount = room.track_count || 0;

  return (
    <div className={styles.roomCard} onClick={onClick}>
      <div className={styles.roomCardIcon}>
        <FaDoorOpen />
      </div>
      <div className={styles.roomCardInfo}>
        <h3 className={styles.roomCardName}>{room.name}</h3>
        <div className={styles.roomCardMeta}>
          <span className={styles.roomCardMemberCount}>
            <FaUsers />
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </span>
          <span className={styles.roomCardTrackCount}>
            <FaMusic />
            {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default RoomCard;
