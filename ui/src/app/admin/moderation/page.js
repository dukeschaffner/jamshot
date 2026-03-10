'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import MiniTrack from '@/components/MiniTrack';
import Waveform from '@/components/Waveform';
import { adminApi } from '@/lib/api';
import styles from './AdminModeration.module.css';
import { useAudio } from '@/lib/AudioContext';
import { MiniPlayButton } from '@/components/MiniTrack';

export default function AdminModerationPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { currentTrack, isPlaying, togglePlayPause, playTrack, audioSourceType, setAudioSourceType } = useAudio();
  const [rootId, setRootId] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(null);
  const [selectedRejectionReason, setSelectedRejectionReason] = useState('');

  // Check admin privileges
  useEffect(() => {
    if (!userLoading && (!user || (!user.is_admin && user.is_admin !== undefined))) {
      router.push('/');
      return;
    }
  }, [user, userLoading, router]);

  // Auto-refresh when tracks list is small
  useEffect(() => {
    if (tracks.length <= 10 && !loading && rootId) {
      if (autoRefreshInterval) clearInterval(autoRefreshInterval);

      const interval = setInterval(() => {
        loadTracks(false); // Don't reset the list, just append
      }, 30000); // 30 seconds

      setAutoRefreshInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        setAutoRefreshInterval(null);
      }
    }
  }, [tracks.length, loading, rootId]);

  const loadTracks = useCallback(async (reset = true) => {
    if (!rootId.trim()) return;

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.append('limit', '15');
      if (!reset && cursor) {
        params.append('cursor', cursor);
      }

      const response = await adminApi.getModerationTracks(rootId, {
        limit: 15,
        ...(cursor ? { cursor } : {})
      });

      const data = response.data;

      if (reset) {
        setTracks(data.tracks || []);
      } else {
        setTracks(prev => [...prev, ...(data.tracks || [])]);
      }

      setHasMore(data.pagination?.hasMore || false);
      if(data.pagination?.cursor) {
        setCursor(data.pagination?.cursor);
      }
    } catch (err) {
      console.error('Error loading tracks:', err);
      setError(err.message || 'Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, [rootId, cursor]);

  const handleApprove = async (trackId) => {
    try {
      await adminApi.approveTrack(trackId);

      // Remove track from list
      setTracks(prev => prev.filter(track => track.id !== trackId));
    } catch (err) {
      console.error('Error approving track:', err);
      setError('Failed to approve track: ' + err.message);
    }
  };

  const handleReject = async (trackId, reason) => {
    try {
      await adminApi.rejectTrack(trackId, reason);

      // Remove track from list
      setTracks(prev => prev.filter(track => track.id !== trackId));
    } catch (err) {
      console.error('Error rejecting track:', err);
      setError('Failed to reject track: ' + err.message);
    }
  };


  const handleSubmit = (e) => {
    e.preventDefault();
    loadTracks(true);
  };

  const handleLoadMore = () => {
    loadTracks(false);
  };

  const handlePlayToggle = (e, track, clickedAudioSourceType) => {
    e.stopPropagation();
    
    if (currentTrack?.id === track.id && clickedAudioSourceType === audioSourceType) {
      togglePlayPause();
    } else {
      playTrack(track, [], clickedAudioSourceType);
    }
  };

  // Show loading while checking user auth
  if (userLoading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  // Don't render if user is not admin
  if (!user || !user.is_admin) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.errorMessage}>Access denied. Admin privileges required.</div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.pageTitle}>Admin Moderation</h1>

      <form onSubmit={handleSubmit} className={styles.formContainer}>
        <div className={styles.formRow}>
          <label htmlFor="rootId" className={styles.formLabel}>Root Track ID:</label>
          <input
            id="rootId"
            type="text"
            value={rootId}
            onChange={(e) => setRootId(e.target.value)}
            placeholder="Enter root track ID"
            className={styles.formInput}
          />
          <button
            type="submit"
            disabled={loading || !rootId.trim()}
            className={styles.submitButton}
          >
            {loading ? 'Loading...' : 'Load Tracks'}
          </button>
        </div>
      </form>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      <div className={styles.tracksList}>
        {tracks.map(track => (
          <div key={track.id} className={styles.trackItem}>
            <div className={styles.trackInfo}>
              <MiniTrack track={track} />
            </div>

            <div className={styles.waveformContainer}>
              <MiniPlayButton isPlaying={isPlaying} isCurrentTrack={ currentTrack?.id === track.id && audioSourceType === 'audio' } handleToggle={(e) => handlePlayToggle(e, track, "audio")} />
              <Waveform
                track={track}
                type="stem"
              />
            </div>
            <div className={styles.waveformContainer}>
              <MiniPlayButton isPlaying={isPlaying} isCurrentTrack={ currentTrack?.id === track.id && audioSourceType === 'combined' } handleToggle={(e) => handlePlayToggle(e, track, "combined")} />
              <Waveform
                track={track}
                type="combined"
              />
            </div>

            <div className={styles.actionButtons}>
              <div className={styles.rejectionReasonContainer}>
                <select
                  value={selectedRejectionReason}
                  onChange={(e) => setSelectedRejectionReason(e.target.value)}
                  className={styles.rejectionReasonSelect}
                >
                  <option value="">Select rejection reason...</option>
                  <option value="Copyright infringement">Copyright infringement</option>
                  <option value="Spam">Spam</option>
                  <option value="Hate speech or discriminatory content">Hate speech or discriminatory content</option>
                  <option value="Explicit sexual content">Explicit sexual content</option>
                </select>
              </div>

              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to approve "${track.title}"?`)) {
                    handleApprove(track.id);
                  }
                }}
                className={styles.approveButton}
              >
                Approve
              </button>

              <button
                onClick={() => {
                  if (!selectedRejectionReason) {
                    alert('Please select a rejection reason first.');
                    return;
                  }
                  if (confirm(`Are you sure you want to reject "${track.title}" for "${selectedRejectionReason}"? This action cannot be undone.`)) {
                    handleReject(track.id, selectedRejectionReason);
                  }
                }}
                className={styles.rejectButton}
                disabled={!selectedRejectionReason}
              >
                Reject
              </button>
            </div>
          </div>
        ))}

        {tracks.length === 0 && !loading && rootId && (
          <div className={styles.emptyState}>
            No tracks waiting for approval found.
          </div>
        )}

        {hasMore && (
          <div className={styles.loadMoreContainer}>
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className={styles.loadMoreButton}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}

        {tracks.length > 0 && tracks.length <= 10 && !loading && (
          <div className={styles.autoRefreshMessage}>
            Auto-refreshing every 30 seconds while tracks list is small...
          </div>
        )}
      </div>

    </div>
  );
}