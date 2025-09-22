'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaTrophy, FaCalendarAlt, FaDollarSign, FaUsers, FaClock, FaPlay, FaPause, FaHeart, FaRegHeart, FaRetweet, FaShareAlt, FaCodeBranch, FaInfoCircle, FaMusic, FaEye, FaComment, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import { useAudio } from '../lib/AudioContext';
import { competitionApi } from '../lib/api';
import Track from './Track';
import styles from './Competition.module.css';
import TimeDisplay from './TimeDisplay';

export default function Competition({
  competition,
  allTracks,
  setExpandedTrackId,
  expandedTrackId,
  view = 'default',
  setSelectedTrack,
  trackTreeIds,
  hideViewDetails = false
}) {
  const router = useRouter();
  const { user: currentUser, isAuthenticated } = useUser();
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  
  const [isEntering, setIsEntering] = useState(false);
  const [entryStatus, setEntryStatus] = useState(null);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Competition status
  const now = new Date();
  const startDate = new Date(competition.startdate);
  const endDate = new Date(competition.enddate);
  const isActive = now >= startDate && now <= endDate;
  const isUpcoming = now < startDate;
  const isEnded = now > endDate;
  const hasWinner = competition.winner_id;

  // Format dates
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Check if user has already entered
  useEffect(() => {
    const checkEntryStatus = async () => {
      if (!isAuthenticated || !competition.id) return;
      
      try {
        const response = await competitionApi.getCompetitionEntries(competition.id);
        const entries = Array.isArray(response.data) ? response.data : [];
        
        // Check if current user has entered
        const userEntry = entries.find(entry => entry.user_id === currentUser?.id);
        setEntryStatus(userEntry ? 'entered' : 'not_entered');
        setEntryCount(entries.length);
      } catch (err) {
        console.error('Error checking entry status:', err);
        // Set default values on error
        setEntryStatus('not_entered');
        setEntryCount(0);
      }
    };

    checkEntryStatus();
  }, [competition.id, currentUser?.id, isAuthenticated]);

  const handleEnterCompetition = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (entryStatus === 'entered') {
      setError('You have already entered this competition');
      return;
    }

    if (!isActive) {
      setError('This competition is not currently active');
      return;
    }

    if (competition.host_id === currentUser?.id) {
      setError('You cannot enter your own competition');
      return;
    }

    setIsEntering(true);
    setError('');

    try {
      // Navigate to upload page with competition context
      router.push(`/upload?competition=${competition.id}`);
    } catch (err) {
      console.error('Error entering competition:', err);
      setError('Failed to enter competition. Please try again.');
    } finally {
      setIsEntering(false);
    }
  };

  const handleViewCompetition = () => {
    router.push(`/competition/${competition.id}`);
  };

  const getStatusBadge = () => {
    if (hasWinner) {
      return (
        <div className={styles.statusBadge + ' ' + styles.winnerBadge}>
          <FaTrophy />
          Winner Selected
        </div>
      );
    }
    
    if (isActive) {
      return (
        <div className={styles.statusBadge + ' ' + styles.activeBadge}>
          <FaPlay />
          Active
        </div>
      );
    }
    
    if (isUpcoming) {
      return (
        <div className={styles.statusBadge + ' ' + styles.upcomingBadge}>
          <FaClock />
          Upcoming
        </div>
      );
    }
    
    if (isEnded) {
      return (
        <div className={styles.statusBadge + ' ' + styles.endedBadge}>
          <FaExclamationTriangle />
          Ended
        </div>
      );
    }
  };

  const getPrizeDisplay = () => {
    if (competition.prize_amount) {
      return `$${(competition.prize_amount / 100).toFixed(0)}`;
    }
    return 'Prize TBD';
  };

  const getTimeRemaining = () => {
    if (isUpcoming) {
      const diff = startDate.getTime() - now.getTime();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return `Starts in ${days} day${days !== 1 ? 's' : ''}`;
    }
    
    if (isActive) {
      const diff = endDate.getTime() - now.getTime();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return `${days} day${days !== 1 ? 's' : ''} left`;
    }
    
    return 'Competition ended';
  };

  return (
    <div className={styles.competitionContainer}>
      {/* Competition Header */}
      <div className={styles.competitionHeader}>
        <div className={styles.competitionInfo}>
          <div className={styles.competitionTitle}>
            <FaTrophy className={styles.trophyIcon} />
            <h3>
              {competition.sponsored ? competition.title : 'Competition'}
              {competition.pinned && <span className={styles.pinnedBadge}>PINNED</span>}
            </h3>
          </div>
          
          {competition.sponsored && competition.sponsor_name && (
            <div className={styles.sponsorInfo}>
              <span>Sponsored by {competition.sponsor_name}</span>
            </div>
          )}
          
          <div className={styles.competitionMeta}>
            <div className={styles.metaItem}>
              <FaDollarSign />
              <span>{getPrizeDisplay()}</span>
            </div>
            <div className={styles.metaItem}>
              <FaUsers />
              <span>{entryCount} entr{entryCount !== 1 ? 'ies' : 'y'}</span>
            </div>
            <div className={styles.metaItem}>
              <FaClock />
              <span>{getTimeRemaining()}</span>
            </div>
          </div>
        </div>
        
        <div className={styles.competitionActions}>
          {getStatusBadge()}
          {!hideViewDetails && (
            <button
              onClick={handleViewCompetition}
              className="pill-btn"
            >
              View Details
            </button>
          )}
        </div>
      </div>

      {/* Competition Description */}
      {competition.description && (
        <div className={styles.competitionDescription}>
          <p>{competition.description}</p>
        </div>
      )}

      {/* Track Component with Competition Context */}
      <div className={styles.trackWrapper}>
        <Track
          track={competition.track}
          allTracks={allTracks}
          setExpandedTrackId={setExpandedTrackId}
          expandedTrackId={expandedTrackId}
          view="competition"
          setSelectedTrack={setSelectedTrack}
          trackTreeIds={trackTreeIds}
          competition={competition}
          entryStatus={entryStatus}
          onEnterCompetition={handleEnterCompetition}
          isEntering={isEntering}
        />
      </div>

      {/* Competition Footer */}
      <div className={styles.competitionFooter}>
        <div className={styles.competitionDates}>
          <div className={styles.dateItem}>
            <FaCalendarAlt />
            <span>Starts: {formatDate(competition.startdate)}</span>
          </div>
          <div className={styles.dateItem}>
            <FaCalendarAlt />
            <span>Ends: {formatDate(competition.enddate)}</span>
          </div>
        </div>
        
        <div className={styles.competitionStats}>
          <span>Selection: {competition.winner_selection_method === 'automated' ? 'Automated' : 'Curated'}</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.errorMessage}>
          <FaExclamationTriangle />
          {error}
        </div>
      )}
    </div>
  );
}
