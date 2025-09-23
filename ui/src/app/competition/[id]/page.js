'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { FaTrophy, FaCalendarAlt, FaDollarSign, FaUsers, FaClock, FaPlay, FaPause, FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaShareAlt, FaHeart, FaRegHeart, FaRetweet, FaCodeBranch, FaMusic, FaEye, FaComment } from 'react-icons/fa';
import { competitionApi, trackApi } from '../../../lib/api';
import { formatCompetitionDateRange } from '../../../shared/utils/formatting';
import Competition from '../../../components/Competition';
import LoadingSpinner from '../../../components/LoadingSpinner';
import styles from './CompetitionDetail.module.css';

export default function CompetitionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user: currentUser, isAuthenticated } = useUser();
  
  const [competition, setCompetition] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [error, setError] = useState('');
  const [entryStatus, setEntryStatus] = useState(null);
  const [isEntering, setIsEntering] = useState(false);

  const competitionId = params.id;

  useEffect(() => {
    if (competitionId) {
      loadCompetition();
      loadEntries();
    }
  }, [competitionId]);

  const loadCompetition = async () => {
    try {
      setLoading(true);
      const response = await competitionApi.getCompetition(competitionId);
      setCompetition(response.data);
    } catch (err) {
      console.error('Error loading competition:', err);
      setError('Failed to load competition');
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = async () => {
    try {
      setLoadingEntries(true);
      const response = await competitionApi.getCompetitionEntries(competitionId);
      const entries = Array.isArray(response.data) ? response.data : [];
      setEntries(entries);
      
      // Check if current user has entered
      if (isAuthenticated && currentUser?.id) {
        const userEntry = entries.find(entry => entry.user_id === currentUser.id);
        setEntryStatus(userEntry ? 'entered' : 'not_entered');
      }
    } catch (err) {
      console.error('Error loading entries:', err);
      // Set default values on error
      setEntries([]);
      setEntryStatus('not_entered');
    } finally {
      setLoadingEntries(false);
    }
  };

  const handleEnterCompetition = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (entryStatus === 'entered') {
      setError('You have already entered this competition');
      return;
    }

    if (!competition) return;

    const now = new Date();
    const startDate = new Date(competition.startdate);
    const endDate = new Date(competition.enddate);
    const isActive = now >= startDate && now <= endDate;

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
      router.push(`/upload?competition=${competitionId}`);
    } catch (err) {
      console.error('Error entering competition:', err);
      setError('Failed to enter competition. Please try again.');
    } finally {
      setIsEntering(false);
    }
  };

  // Date formatting is handled by shared utilities

  const getTimeRemaining = () => {
    if (!competition) return '';
    
    const now = new Date();
    const startDate = new Date(competition.startdate);
    const endDate = new Date(competition.enddate);
    
    if (now < startDate) {
      const diff = startDate.getTime() - now.getTime();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return `Starts in ${days} day${days !== 1 ? 's' : ''}`;
    }
    
    if (now <= endDate) {
      const diff = endDate.getTime() - now.getTime();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return `${days} day${days !== 1 ? 's' : ''} left`;
    }
    
    return 'Competition ended';
  };

  const getStatusBadge = () => {
    if (!competition) return null;
    
    const now = new Date();
    const startDate = new Date(competition.startdate);
    const endDate = new Date(competition.enddate);
    const isActive = now >= startDate && now <= endDate;
    const isUpcoming = now < startDate;
    const isEnded = now > endDate;
    const hasWinner = competition.winner_id;

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

  if (loading) {
    return (
      <div className={styles.competitionDetailPage}>
        <div className={styles.loadingContainer}>
          <LoadingSpinner />
          <p>Loading competition...</p>
        </div>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className={styles.competitionDetailPage}>
        <div className={styles.errorContainer}>
          <FaExclamationTriangle />
          <h3>Competition Not Found</h3>
          <p>{error || 'This competition does not exist or has been removed.'}</p>
          <button
            onClick={() => router.push('/competitions')}
            className="pill-btn gradient-btn"
          >
            Back to Competitions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.competitionDetailPage}>
      {/* Header */}
      <div className={styles.header}>
        <button
          onClick={() => router.back()}
          className="pill-btn"
        >
          <FaArrowLeft style={{ marginRight: '8px' }} />
          Back
        </button>
        
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>
            <FaTrophy style={{ marginRight: '12px' }} />
            {competition.sponsored ? competition.title : 'Competition'}
            {competition.pinned && <span className={styles.pinnedBadge}>PINNED</span>}
          </h1>
          
          {competition.sponsored && competition.sponsor_name && (
            <p className={styles.sponsorInfo}>
              Sponsored by {competition.sponsor_name}
            </p>
          )}
        </div>
        
        <div className={styles.headerActions}>
          {getStatusBadge()}
        </div>
      </div>

      {/* Competition Info */}
      <div className={styles.competitionInfo}>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <FaDollarSign />
            <div>
              <span className={styles.infoLabel}>Prize</span>
              <span className={styles.infoValue}>
                {competition.prize_amount ? `$${(competition.prize_amount / 100).toFixed(0)}` : 'Prize TBD'}
              </span>
            </div>
          </div>
          
          <div className={styles.infoItem}>
            <FaUsers />
            <div>
              <span className={styles.infoLabel}>Entries</span>
              <span className={styles.infoValue}>{entries.length}</span>
            </div>
          </div>
          
          <div className={styles.infoItem}>
            <FaClock />
            <div>
              <span className={styles.infoLabel}>Time Remaining</span>
              <span className={styles.infoValue}>{getTimeRemaining()}</span>
            </div>
          </div>
          
          <div className={styles.infoItem}>
            <FaCalendarAlt />
            <div>
              <span className={styles.infoLabel}>Selection Method</span>
              <span className={styles.infoValue}>
                {competition.winner_selection_method === 'automated' ? 'Automated' : 'Curated'}
              </span>
            </div>
          </div>
        </div>
        
        <div className={styles.dates}>
          <div className={styles.dateItem}>
            <strong>Duration:</strong> {formatCompetitionDateRange(competition.startdate, competition.enddate)}
          </div>
        </div>
      </div>

      {/* Description */}
      {competition.description && (
        <div className={styles.description}>
          <h3>Description</h3>
          <p>{competition.description}</p>
        </div>
      )}

      {/* Competition Track */}
      <div className={styles.trackSection}>
        <h3>Competition Track</h3>
        <Competition
          competition={competition}
          allTracks={[]}
          setExpandedTrackId={() => {}}
          expandedTrackId={null}
          hideViewDetails={true}
        />
      </div>

      {/* Entries - Only show if competition is not upcoming */}
      {(() => {
        const now = new Date();
        const startDate = new Date(competition.startdate);
        const isUpcoming = now < startDate;

        if (isUpcoming) {
          return null;
        }

        return (
          <div className={styles.entriesSection}>
            <h3>Competition Entries ({entries.length})</h3>

            {loadingEntries ? (
              <div className={styles.loadingContainer}>
                <LoadingSpinner />
                <p>Loading entries...</p>
              </div>
            ) : entries.length === 0 ? (
              <div className={styles.emptyEntries}>
                <FaTrophy />
                <h4>No Entries Yet</h4>
                <p>Be the first to enter this competition!</p>
              </div>
            ) : (
              <div className={styles.entriesList}>
                {entries.map((entry, index) => (
                  <div key={entry.id} className={styles.entryItem}>
                    <div className={styles.entryRank}>#{index + 1}</div>
                    <div className={styles.entryTrack}>
                      <span className={styles.entryTitle}>{entry.title}</span>
                      <span className={styles.entryArtist}>by {entry.username}</span>
                    </div>
                    <div className={styles.entryStats}>
                      <span>{entry.like_count || 0} likes</span>
                      <span>{entry.play_count || 0} plays</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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
