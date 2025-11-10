import { useState, useEffect } from 'react';
import { campApi } from '../../../../lib/api';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { FaUsers, FaMusic } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function RoomCard({ room, campId, isSelected, onClick }) {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isSelected && tracks.length === 0) {
      const fetchRoomTracks = async () => {
        try {
          setIsLoading(true);
          const response = await campApi.getRoomTracks(campId, room.id, {
            page: 1,
            limit: 5
          });
          setTracks(response.data.tracks);
        } catch (err) {
          console.error('Error fetching room tracks:', err);
        } finally {
          setIsLoading(false);
        }
      };

      fetchRoomTracks();
    }
  }, [isSelected, campId, room.id, tracks.length]);

  return (
    <div className={`${styles.roomCard} ${isSelected ? styles.selected : ''}`} onClick={onClick}>
      <div className={styles.roomCardHeader}>
        <h3>{room.name}</h3>
        <span className={styles.roomMemberCount}>
          <FaUsers />
          {room.members?.length || 0} members
        </span>
      </div>

      {isSelected && (
        <div className={styles.roomCardContent}>
          {room.members && room.members.length > 0 && (
            <div className={styles.roomMembersPreview}>
              <h4>Members</h4>
              <div className={styles.memberAvatarList}>
                {room.members.slice(0, 5).map(member => (
                  <img
                    key={member.id}
                    src={member.profile_pic_url || '/avatar.svg'}
                    alt={member.username}
                    className={styles.memberAvatarSmall}
                    title={member.username}
                  />
                ))}
                {room.members.length > 5 && (
                  <span className={styles.moreMembers}>+{room.members.length - 5}</span>
                )}
              </div>
            </div>
          )}

          {isLoading ? (
            <LoadingSpinner />
          ) : tracks.length > 0 ? (
            <div className={styles.roomTracksPreview}>
              <h4>{tracks.length} Track{tracks.length !== 1 ? 's' : ''}</h4>
              <div className={styles.trackPreviewList}>
                {tracks.map(track => (
                  <div key={track.id} className={styles.trackPreviewItem}>
                    <FaMusic />
                    <span>{track.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className={styles.noTracks}>No tracks in this room yet</p>
          )}
        </div>
      )}
    </div>
  );
}

export default RoomCard;
