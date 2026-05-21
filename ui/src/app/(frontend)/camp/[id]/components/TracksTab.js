import { useState, useEffect } from 'react';
import { campApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import MiniTrack from '@/components/MiniTrack';
import { FaMusic } from 'react-icons/fa';
import sharedStyles from '@/styles/Dashboard.module.css';

function TracksTab({ camp }) {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recent');
  const [filterRoom, setFilterRoom] = useState('all');

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        setIsLoading(true);
        const params = {
          sort_by: sortBy,
          page: 1,
          limit: 50
        };

        if (filterRoom !== 'all') {
          params.room_id = filterRoom;
        }

        const response = await campApi.getTracks(camp.id, params);
        setTracks(response.data.tracks);
      } catch (err) {
        console.error('Error fetching camp tracks:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTracks();
  }, [camp.id, sortBy, filterRoom]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className={sharedStyles.tabContent}>
      <div className={sharedStyles.tabHeader}>
        <h2>All Tracks</h2>
        <div className={sharedStyles.tabActions}>
          <select
            value={filterRoom}
            onChange={(e) => setFilterRoom(e.target.value)}
            className={sharedStyles.sortSelect}
          >
            <option value="all">All Rooms</option>
            {camp.rooms?.map(room => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={sharedStyles.sortSelect}
          >
            <option value="recent">Most Recent</option>
            <option value="likes">Most Liked</option>
          </select>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className={sharedStyles.emptyState}>
          <FaMusic className={sharedStyles.emptyIcon} />
          <h3>No Tracks Yet</h3>
          <p>Start building on beats from the Beat Pool!</p>
        </div>
      ) : (
        <div className={sharedStyles.trackList}>
          {tracks.map(track => (
            <MiniTrack key={track.id} track={track} />
          ))}
        </div>
      )}
    </div>
  );
}

export default TracksTab;
