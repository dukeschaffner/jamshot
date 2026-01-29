'use client';
import { useState, useEffect } from 'react';
import { FaVideo } from 'react-icons/fa';
import { trackApi } from '../lib/api';
import styles from './VideoExportModal.module.css';

export default function VideoExportModal({
  isOpen,
  onClose,
  track,
  onExportStart
}) {
  const [startTime, setStartTime] = useState(0);
  const [duration, setDuration] = useState(90);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Prefill duration based on track duration
  useEffect(() => {
    if (track && track.duration) {
      const trackDuration = parseFloat(track.duration);
      const prefilledDuration = trackDuration <= 90 ? trackDuration : 90;
      setDuration(Math.round(prefilledDuration));
    }
  }, [track]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!track) return;

    // Validate inputs
    const start = parseFloat(startTime) || 0;
    const dur = parseFloat(duration) || 90;

    if (start < 0) {
      setError('Start time must be 0 or greater');
      return;
    }

    if (dur <= 0 || dur > 90) {
      setError('Duration must be between 0 and 90 seconds');
      return;
    }

    if (start + dur > track.duration) {
      setError('Start time + duration exceeds track duration');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await trackApi.requestVideoExport(track.id, start, dur);
      const exportId = response.data.export_id;
      
      if (onExportStart) {
        onExportStart(exportId);
      }
      onClose();
    } catch (err) {
      console.error('Error requesting video export:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to start video export. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError('');
      onClose();
    }
  };

  return (
    <div 
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          handleClose();
        }
      }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <FaVideo className={styles.icon} />
          <h2 className={styles.title}>Generate Video</h2>
        </div>
        
        <div className={styles.content}>
          <p className={styles.description}>
            Export a video of your track with animated waveforms. Videos are limited to 90 seconds.
          </p>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <div className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="start-time" className={styles.label}>
                Start Time (seconds)
              </label>
              <input
                id="start-time"
                type="number"
                min="0"
                step="0.1"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isLoading}
                className={styles.input}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="duration" className={styles.label}>
                Duration (seconds)
              </label>
              <input
                id="duration"
                type="number"
                min="0.1"
                max="90"
                step="0.1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={isLoading}
                className={styles.input}
              />
              <span className={styles.hint}>Max: 90 seconds</span>
            </div>

            {track && (
              <div className={styles.trackInfo}>
                <span className={styles.trackInfoLabel}>Track duration:</span>
                <span className={styles.trackInfoValue}>{Math.round(track.duration)}s</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className={`${styles.button} ${styles.cancelButton}`}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className={`${styles.button} ${styles.generateButton}`}
          >
            {isLoading ? 'Generating...' : 'Generate Video'}
          </button>
        </div>
      </div>
    </div>
  );
}

