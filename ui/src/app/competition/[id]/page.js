'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { FaTrophy, FaCalendarAlt, FaDollarSign, FaUsers, FaClock, FaPlay, FaPause, FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaShareAlt, FaHeart, FaRegHeart, FaRetweet, FaCodeBranch, FaMusic, FaEye, FaComment } from 'react-icons/fa';
import { competitionApi, trackApi } from '../../../lib/api';
import { formatCompetitionDateRange } from '@sterio/formatting-utils';
import Competition from '../../../components/Competition';
import MiniTrack from '../../../components/MiniTrack';
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [entryStatus, setEntryStatus] = useState(null);
  const [isEntering, setIsEntering] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreEntries, setHasMoreEntries] = useState(true);
  const ENTRIES_PER_PAGE = 20;

  const competitionId = params.id;

  useEffect(() => {
    if (competitionId) {
      loadCompetition();
      loadEntries(true);
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

  const loadEntries = async (reset = false) => {
    try {
      if (reset) {
        setLoadingEntries(true);
        setCurrentPage(1);
        setHasMoreEntries(true);
      } else {
        setLoadingMore(true);
      }

      const page = reset ? 1 : currentPage;
      const response = await competitionApi.getCompetitionEntries(competitionId, page, ENTRIES_PER_PAGE);
      const newEntries = Array.isArray(response.data.data) ? response.data.data : [];
      const totalEntries = response.data.pagination?.total || 0;

      if (reset) {
        setEntries(newEntries);
      } else {
        setEntries(prev => [...prev, ...newEntries]);
      }

      // Update pagination state
      const hasMore = response.data.pagination?.hasMore || false;
      setHasMoreEntries(hasMore);

      if (!reset) {
        setCurrentPage(prev => prev + 1);
      }

      // Check if current user has entered
      if (isAuthenticated && currentUser?.id) {
        const allEntries = reset ? newEntries : [...entries, ...newEntries];
        const userEntry = allEntries.find(entry => entry.user_id === currentUser.id);
        setEntryStatus(userEntry ? 'entered' : 'not_entered');
      }
    } catch (err) {
      console.error('Error loading entries:', err);
      // Set default values on error
      if (reset) {
        setEntries([]);
        setEntryStatus('not_entered');
      }
    } finally {
      if (reset) {
        setLoadingEntries(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  const loadMoreEntries = useCallback(() => {
    if (!loadingMore && hasMoreEntries) {
      loadEntries(false);
    }
  }, [loadingMore, hasMoreEntries, currentPage, entries]);

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
      // Navigate to track page with competition context
      router.push(`/track/${competition.track.guid}?competition=${competition.id}`);
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
        const endDate = new Date(competition.enddate);
        const isUpcoming = now < startDate;
        const isEnded = now > endDate;
        const hasWinner = competition.winner_id;

        if (isUpcoming) {
          return null;
        }

        // Sort entries: winner first if competition is ended and has winner
        let displayEntries = [...entries];
        if (isEnded && hasWinner) {
          const winnerEntry = displayEntries.find(entry => entry.id === competition.winner_id);
          if (winnerEntry) {
            displayEntries = [
              winnerEntry,
              ...displayEntries.filter(entry => entry.id !== competition.winner_id)
            ];
          }
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
                {displayEntries.map((entry, index) => (
                  <div key={entry.id} className={styles.entryItem}>
                    {isEnded && hasWinner && entry.id === competition.winner_id && (
                      <div className={styles.winnerBadge}>
                        <FaTrophy />
                        WINNER
                      </div>
                    )}
                    <MiniTrack
                      track={entry}
                      relatedTracks={displayEntries}
                      view="competition"
                    />
                  </div>
                ))}

                {/* Load more button or endless scroll trigger */}
                {hasMoreEntries && (
                  <div className={styles.loadMoreContainer}>
                    {loadingMore ? (
                      <div className={styles.loadingMore}>
                        <LoadingSpinner />
                        <p>Loading more entries...</p>
                      </div>
                    ) : (
                      <button
                        onClick={loadMoreEntries}
                        className="pill-btn"
                        disabled={loadingMore}
                      >
                        Load More Entries
                      </button>
                    )}
                  </div>
                )}
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
