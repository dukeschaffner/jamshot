import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { campApi } from '../../../../lib/api';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import BeatCard from '../../../../components/BeatCard';
import { FaUpload, FaMusic } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function BeatPoolTab({ camp, isActive }) {
  const router = useRouter();
  const [beats, setBeats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recent');
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    const fetchBeats = async () => {
      try {
        setIsLoading(true);
        const response = await campApi.getBeats(camp.id, {
          sort_by: sortBy,
          page: 1,
          limit: 50
        });
        setBeats(response.data.beats);
      } catch (err) {
        console.error('Error fetching beats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBeats();
  }, [camp.id, sortBy]);

  const handleAddBeat = () => {
    // Navigate to upload page with camp context
    router.push(`/upload?camp_id=${camp.id}`);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2>Beat Pool</h2>
        <div className={styles.tabActions}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={styles.sortSelect}
          >
            <option value="recent">Most Recent</option>
            <option value="bpm">BPM</option>
            <option value="key">Key</option>
            <option value="usage">Most Used</option>
          </select>
          <button onClick={handleAddBeat} className={styles.primaryButton}>
            <FaUpload />
            <span>Add Beat</span>
          </button>
        </div>
      </div>

      {beats.length === 0 ? (
        <div className={styles.emptyState}>
          <FaMusic className={styles.emptyIcon} />
          <h3>No Beats Yet</h3>
          <p>Upload your first beat to get the collaboration started!</p>
          <button onClick={handleAddBeat} className={styles.primaryButton}>
            <FaUpload />
            <span>Upload Beat</span>
          </button>
        </div>
      ) : (
        <div className={styles.beatList}>
          {beats.map(beat => (
            <BeatCard key={beat.id} beat={beat} campId={camp.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export default BeatPoolTab;
