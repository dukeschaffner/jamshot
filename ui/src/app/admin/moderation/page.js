'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MiniTrack from '@/components/MiniTrack';
import Waveform from '@/components/Waveform';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { apiFetch } from '@/shared/api';
import styles from './AdminModeration.module.css';

export default function AdminModerationPage() {
  const router = useRouter();
  const [rootId, setRootId] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(null);
  const [confirmationDialog, setConfirmationDialog] = useState({
    open: false,
    title: '',
    message: '',
    onConfirm: null,
    trackId: null,
    action: null
  });
  const [selectedRejectionReason, setSelectedRejectionReason] = useState('');

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

      const response = await apiFetch(`/api/admin/moderation/tracks/${rootId}?${params}`);

      if (!response.ok) {
        if (response.status === 403) {
          setError('You do not have admin privileges to access this page.');
          return;
        }
        throw new Error(`Failed to load tracks: ${response.statusText}`);
      }

      const data = await response.json();

      if (reset) {
        setTracks(data.tracks || []);
      } else {
        setTracks(prev => [...prev, ...(data.tracks || [])]);
      }

      setHasMore(data.pagination?.hasMore || false);
      setCursor(data.pagination?.cursor || null);
    } catch (err) {
      console.error('Error loading tracks:', err);
      setError(err.message || 'Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, [rootId, cursor]);

  const handleApprove = async (trackId) => {
    try {
      const response = await apiFetch(`/api/admin/moderation/tracks/${trackId}/approve`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to approve track');
      }

      // Remove track from list
      setTracks(prev => prev.filter(track => track.id !== trackId));
    } catch (err) {
      console.error('Error approving track:', err);
      setError('Failed to approve track: ' + err.message);
    }
  };

  const handleReject = async (trackId, reason) => {
    try {
      const response = await apiFetch(`/api/admin/moderation/tracks/${trackId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        throw new Error('Failed to reject track');
      }

      // Remove track from list
      setTracks(prev => prev.filter(track => track.id !== trackId));
    } catch (err) {
      console.error('Error rejecting track:', err);
      setError('Failed to reject track: ' + err.message);
    }
  };

  const openConfirmationDialog = (title, message, onConfirm, trackId, action) => {
    setConfirmationDialog({
      open: true,
      title,
      message,
      onConfirm,
      trackId,
      action
    });
  };

  const closeConfirmationDialog = () => {
    setConfirmationDialog({
      open: false,
      title: '',
      message: '',
      onConfirm: null,
      trackId: null,
      action: null
    });
  };

  const handleConfirm = () => {
    if (confirmationDialog.onConfirm) {
      confirmationDialog.onConfirm();
    }
    closeConfirmationDialog();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    loadTracks(true);
  };

  const handleLoadMore = () => {
    loadTracks(false);
  };

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
              <Waveform
                audioUrl={track.combined_audio_url}
                duration={track.duration}
                height={60}
                interactive={false}
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
                onClick={() => openConfirmationDialog(
                  'Approve Track',
                  `Are you sure you want to approve "${track.title}"?`,
                  () => handleApprove(track.id),
                  track.id,
                  'approve'
                )}
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
                  openConfirmationDialog(
                    'Reject Track',
                    `Are you sure you want to reject "${track.title}" for "${selectedRejectionReason}"? This action cannot be undone.`,
                    () => handleReject(track.id, selectedRejectionReason),
                    track.id,
                    'reject'
                  );
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

      <ConfirmationDialog
        open={confirmationDialog.open}
        title={confirmationDialog.title}
        message={confirmationDialog.message}
        onConfirm={handleConfirm}
        onCancel={closeConfirmationDialog}
        confirmText={confirmationDialog.action === 'reject' ? 'Reject' : 'Approve'}
        confirmButtonColor={confirmationDialog.action === 'reject' ? '#dc3545' : '#28a745'}
      />
    </div>
  );
}