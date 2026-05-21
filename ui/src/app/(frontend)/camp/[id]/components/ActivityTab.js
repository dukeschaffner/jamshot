import { useState, useEffect } from 'react';
import { campApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import ActivityItem from './ActivityItem';
import { FaBell } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function ActivityTab({ camp }) {
  // For MVP, we'll show a simple activity feed based on recent tracks and beats
  // This can be expanded later with a dedicated activity tracking system
  const [recentBeats, setRecentBeats] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRecentActivity = async () => {
      try {
        setIsLoading(true);
        // Fetch recent beats and tracks
        const [beatsRes, tracksRes] = await Promise.all([
          campApi.getBeats(camp.id, { sort_by: 'recent', page: 1, limit: 10 }),
          campApi.getTracks(camp.id, { sort_by: 'recent', page: 1, limit: 10 })
        ]);

        setRecentBeats(beatsRes.data.beats);
        setRecentTracks(tracksRes.data.tracks);
      } catch (err) {
        console.error('Error fetching activity:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentActivity();
  }, [camp.id]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Combine and sort activities by timestamp
  const activities = [
    ...recentBeats.map(beat => ({
      type: 'beat',
      timestamp: beat.created_at,
      data: beat
    })),
    ...recentTracks.map(track => ({
      type: 'track',
      timestamp: track.created_at,
      data: track
    }))
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2>Activity Feed</h2>
      </div>

      {activities.length === 0 ? (
        <div className={styles.emptyState}>
          <FaBell className={styles.emptyIcon} />
          <h3>No Activity Yet</h3>
          <p>Activity will appear here as members upload beats and create tracks</p>
        </div>
      ) : (
        <div className={styles.activityList}>
          {activities.map((activity, index) => (
            <ActivityItem key={`${activity.type}-${activity.data.id}-${index}`} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ActivityTab;
