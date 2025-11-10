import { useState, useEffect } from 'react';
import { campApi } from '../../../../lib/api';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import MiniTrack from '../../../../components/MiniTrack';
import { FaMusic, FaUsers } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function MyRoomTab({ camp, room, isActive }) {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRoomTracks = async () => {
      try {
        setIsLoading(true);
        const response = await campApi.getRoomTracks(camp.id, room.id, {
          page: 1,
          limit: 50
        });
        setTracks(response.data.tracks);
      } catch (err) {
        console.error('Error fetching room tracks:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoomTracks();
  }, [camp.id, room.id]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2>{room.name}</h2>
      </div>

      <div className={styles.roomContent}>
        <div className={styles.roomSection}>
          <h3>Members</h3>
          <div className={styles.memberList}>
            {room.members?.map(member => (
              <div key={member.id} className={styles.memberCard}>
                <img
                  src={member.profile_pic_url || '/avatar.svg'}
                  alt={member.username}
                  className={styles.memberAvatar}
                />
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>{member.name || member.username}</span>
                  <span className={styles.memberUsername}>@{member.username}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.roomSection}>
          <h3>Tracks</h3>
          {tracks.length === 0 ? (
            <div className={styles.emptyState}>
              <FaMusic className={styles.emptyIcon} />
              <p>No tracks in this room yet</p>
            </div>
          ) : (
            <div className={styles.trackList}>
              {tracks.map(track => (
                <MiniTrack key={track.id} track={track} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyRoomTab;
