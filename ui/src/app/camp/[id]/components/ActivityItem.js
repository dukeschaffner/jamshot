import { useRouter } from 'next/navigation';
import { FaUpload, FaMusic } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function ActivityItem({ activity }) {
  const router = useRouter();
  const { type, data, timestamp } = activity;

  const formatTimestamp = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now - date;
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const handleClick = () => {
    router.push(`/track/${data.id}`);
  };

  return (
    <div className={styles.activityItem} onClick={handleClick}>
      <div className={styles.activityIcon}>
        {type === 'beat' ? <FaUpload /> : <FaMusic />}
      </div>
      <div className={styles.activityContent}>
        <div className={styles.activityText}>
          <span className={styles.activityUser}>{data.username}</span>
          {type === 'beat' ? (
            <span> uploaded a beat </span>
          ) : (
            <span> created a track in <strong>{data.room_name}</strong> </span>
          )}
          <span className={styles.activityTitle}>{data.title || 'Untitled'}</span>
        </div>
        <div className={styles.activityTime}>{formatTimestamp(timestamp)}</div>
      </div>
    </div>
  );
}

export default ActivityItem;
