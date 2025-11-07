'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import styles from './ReleaseNotes.module.css';

export default function ReleaseNotesPage() {
  const [releaseNotes, setReleaseNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState(null);
  const [lastViewedVersion, setLastViewedVersion] = useState(null);
  const router = useRouter();

  // Get last viewed version from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sterio_last_viewed_release_version');
    setLastViewedVersion(stored);
  }, []);

  // Load release notes
  const loadReleaseNotes = async (page = 1, reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const response = await api.get('/release-notes', {
        params: { page, limit: 10 }
      });

      const { releaseNotes: newNotes, pagination: paginationData } = response.data;

      if (reset) {
        setReleaseNotes(newNotes || []);
      } else {
        setReleaseNotes(prev => [...prev, ...(newNotes || [])]);
      }

      setPagination(paginationData);
      setError('');
    } catch (err) {
      console.error('Failed to fetch release notes:', err);
      setError('Failed to load release notes. Please try again later.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load more release notes
  const loadMore = () => {
    if (!loadingMore && pagination && pagination.hasMore) {
      loadReleaseNotes(pagination.page + 1, false);
    }
  };

  // Update last viewed version when user visits page
  useEffect(() => {
    if (releaseNotes.length > 0) {
      const latestVersion = releaseNotes[0].version;
      // Update localStorage to the latest version seen on this page
      localStorage.setItem('sterio_last_viewed_release_version', latestVersion);
      setLastViewedVersion(latestVersion);
    }
  }, [releaseNotes]);

  // Initial load
  useEffect(() => {
    loadReleaseNotes(1, true);
  }, []);

  // Check if a release note is new (not viewed)
  const isNewRelease = (version) => {
    if (!lastViewedVersion) return true;
    // Simple version comparison - if version is greater than last viewed
    return version > lastViewedVersion;
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  if (loading && releaseNotes.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Release Notes</h1>
        <p className={styles.subtitle}>Stay up to date with the latest updates and features</p>
      </div>

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <div className={styles.releaseNotesList}>
        {releaseNotes.map((release) => (
          <div key={release.id} className={styles.releaseNote}>
            <div className={styles.releaseHeader}>
              <div className={styles.releaseTitleRow}>
                <h2 className={styles.releaseTitle}>{release.title}</h2>
                {isNewRelease(release.version) && (
                  <span className={styles.newBadge}>New</span>
                )}
              </div>
              <div className={styles.releaseMeta}>
                <span className={styles.version}>v{release.version}</span>
                <span className={styles.date}>{formatDate(release.published_at)}</span>
              </div>
            </div>
            <div 
              className={styles.releaseContent}
              dangerouslySetInnerHTML={{ __html: release.content }}
            />
          </div>
        ))}
      </div>

      {pagination && pagination.hasMore && (
        <div className={styles.loadMoreContainer}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className={styles.loadMoreBtn}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {pagination && (
        <div className={styles.paginationInfo}>
          Showing {releaseNotes.length} of {pagination.total} releases
        </div>
      )}
    </div>
  );
}

