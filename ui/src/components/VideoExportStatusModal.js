'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaSpinner, FaDownload, FaRedo, FaTimes } from 'react-icons/fa';
import { trackApi } from '../lib/api';
import styles from './VideoExportStatusModal.module.css';

export default function VideoExportStatusModal({
  isOpen,
  onClose,
  trackId,
  exportId,
  onRetry
}) {
  const [status, setStatus] = useState('processing');
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingTimeoutRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const pollIntervalRef = useRef(null);

  const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
  const POLL_INTERVAL_MS = 3000; // 3 seconds

  const pollStatus = useCallback(async () => {
    if (!trackId || !exportId || isPolling) return;

    try {
      setIsPolling(true);
      const response = await trackApi.getVideoExportStatus(trackId, exportId);
      const data = response.data;

      setStatus(data.status);
      
      if (data.status === 'completed' && data.video_url) {
        setVideoUrl(data.video_url);
        setIsPolling(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (pollingTimeoutRef.current) {
          clearTimeout(pollingTimeoutRef.current);
          pollingTimeoutRef.current = null;
        }
      } else if (data.status === 'failed') {
        setErrorMessage(data.error_message || 'Video generation failed. Please try again.');
        setIsPolling(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (pollingTimeoutRef.current) {
          clearTimeout(pollingTimeoutRef.current);
          pollingTimeoutRef.current = null;
        }
      } else {
        // Still processing, continue polling
        setIsPolling(false);
      }
    } catch (err) {
      console.error('Error polling video export status:', err);
      setIsPolling(false);
      // Don't stop polling on error, might be temporary
    }
  }, [trackId, exportId, isPolling]);

  // Start polling when modal opens
  useEffect(() => {
    if (isOpen && trackId && exportId) {
      startTimeRef.current = Date.now();
      setStatus('processing');
      setVideoUrl(null);
      setErrorMessage(null);

      // Start polling immediately
      pollStatus();

      // Set up polling interval
      pollIntervalRef.current = setInterval(() => {
        pollStatus();
      }, POLL_INTERVAL_MS);

      // Set up timeout
      pollingTimeoutRef.current = setTimeout(() => {
        if (status === 'processing' || status === 'pending') {
          setStatus('failed');
          setErrorMessage('Video generation timed out after 2 minutes. Please try again.');
          setIsPolling(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      }, TIMEOUT_MS);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (pollingTimeoutRef.current) {
          clearTimeout(pollingTimeoutRef.current);
          pollingTimeoutRef.current = null;
        }
      };
    }
  }, [isOpen, trackId, exportId, pollStatus, status]);

  const handleDownload = async () => {
    if (!videoUrl) {
      // Try to get download URL from API
      try {
        const response = await trackApi.getVideoExportDownload(trackId, exportId);
        const downloadUrl = response.data.download_url;
        window.open(downloadUrl, '_blank');
      } catch (err) {
        console.error('Error getting download URL:', err);
        // Fallback to video_url if available
        if (videoUrl) {
          window.open(videoUrl, '_blank');
        }
      }
    } else {
      window.open(videoUrl, '_blank');
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
    onClose();
  };

  const handleClose = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    onClose();
  };

  if (!isOpen) return null;

  const getStatusIcon = () => {
    if (status === 'completed') {
      return <FaCheckCircle className={styles.statusIcon} style={{ color: '#10b981' }} />;
    } else if (status === 'failed') {
      return <FaExclamationCircle className={styles.statusIcon} style={{ color: '#ef4444' }} />;
    } else {
      return <FaSpinner className={`${styles.statusIcon} ${styles.spinning}`} style={{ color: 'var(--seafoam)' }} />;
    }
  };

  const getStatusMessage = () => {
    if (status === 'completed') {
      return 'Video generated successfully!';
    } else if (status === 'failed') {
      return errorMessage || 'Video generation failed. Please try again.';
    } else {
      return 'Generating your video... This may take a few moments.';
    }
  };

  return (
    <div 
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={styles.statusContainer}>
            {getStatusIcon()}
            <h2 className={styles.title}>Video Export</h2>
          </div>
          <button
            onClick={handleClose}
            className={styles.closeButton}
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        
        <div className={styles.content}>
          <p className={styles.statusMessage}>
            {getStatusMessage()}
          </p>

          {status === 'processing' && (
            <div className={styles.progressInfo}>
              <p className={styles.progressText}>
                Processing video with animated waveforms...
              </p>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {status === 'completed' && (
            <button
              onClick={handleDownload}
              className={`${styles.button} ${styles.downloadButton}`}
            >
              <FaDownload /> Download Video
            </button>
          )}
          
          {(status === 'failed' || (status === 'processing' && errorMessage)) && (
            <button
              onClick={handleRetry}
              className={`${styles.button} ${styles.retryButton}`}
            >
              <FaRedo /> Retry Export
            </button>
          )}
          
          <button
            onClick={handleClose}
            className={`${styles.button} ${styles.closeButtonAction}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

