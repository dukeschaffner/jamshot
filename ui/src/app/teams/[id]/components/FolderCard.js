'use client';
import { FaFolder, FaMusic } from 'react-icons/fa';
import styles from '../TeamDashboard.module.css';

function FolderCard({ folder, onClick }) {
  return (
    <div className={styles.folderCard} onClick={onClick}>
      <div className={styles.folderCardIcon}>
        <FaFolder />
      </div>
      <div className={styles.folderCardInfo}>
        <h3 className={styles.folderCardName}>{folder.name}</h3>
        <div className={styles.folderCardMeta}>
          <span className={styles.folderCardTrackCount}>
            <FaMusic />
            {folder.track_count || 0} {Number(folder.track_count) === 1 ? 'track' : 'tracks'}
          </span>
          {folder.creator_name && (
            <span className={styles.folderCardCreator}>
              Created by {folder.creator_name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default FolderCard;

