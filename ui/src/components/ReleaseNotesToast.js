'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaTimes, FaRocket } from 'react-icons/fa';
import api from '@/lib/api';
import styles from './ReleaseNotesToast.module.css';

export default function ReleaseNotesToast() {
  const [showToast, setShowToast] = useState(false);
  const [latestRelease, setLatestRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkForNewRelease = async () => {
      try {
        setLoading(true);
        const response = await api.get('/release-notes/latest');
        
        if (response.data) {
          const latestVersion = response.data.version;
          const lastViewedVersion = localStorage.getItem('sterio_last_viewed_release_version');
          
          // Show toast if there's a new release and user hasn't seen it
          if (!lastViewedVersion || latestVersion > lastViewedVersion) {
            setLatestRelease(response.data);
            setShowToast(true);
          }
        }
      } catch (err) {
        console.error('Failed to check for new release:', err);
      } finally {
        setLoading(false);
      }
    };

    // Small delay to avoid showing toast immediately on page load
    const timer = setTimeout(() => {
      checkForNewRelease();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    if (latestRelease) {
      // Update localStorage to current version
      localStorage.setItem('sterio_last_viewed_release_version', latestRelease.version);
    }
    setShowToast(false);
  };

  const handleClick = () => {
    if (latestRelease) {
      // Update localStorage to current version
      localStorage.setItem('sterio_last_viewed_release_version', latestRelease.version);
    }
    setShowToast(false);
    router.push('/release-notes');
  };

  if (loading || !showToast || !latestRelease) {
    return null;
  }

  return (
    <div className={styles.toastContainer}>
      <div className={styles.toast}>
        <div className={styles.toastContent}>
          <div className={styles.toastIcon}>
            <FaRocket />
          </div>
          <div className={styles.toastText}>
            <div className={styles.toastTitle}>New Update Available!</div>
            <div className={styles.toastMessage}>
              {latestRelease.title} - v{latestRelease.version}
            </div>
          </div>
        </div>
        <div className={styles.toastActions}>
          <button 
            onClick={handleClick}
            className={styles.viewButton}
          >
            View
          </button>
          <button 
            onClick={handleDismiss}
            className={styles.dismissButton}
            aria-label="Dismiss"
          >
            <FaTimes />
          </button>
        </div>
      </div>
    </div>
  );
}

