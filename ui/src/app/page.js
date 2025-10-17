'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../lib/api';
import Track from '../components/Track';
import LoadingSpinner from '../components/LoadingSpinner';
import CustomTabs from '../components/CustomTabs';
import SponsoredCompetition from '../components/SponsoredCompetition';
import { FaTimes, FaInfoCircle, FaMicrophone, FaMusic } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import { useMobile } from '../contexts/MobileContext';
import { trackWelcomeDialogClose, trackFeedChange, trackTrackExpand } from '../lib/analytics';
import styles from './Home.module.css';

export default function Home() {
  const [tracks, setTracks] = useState([]);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [feedType, setFeedType] = useState(null); // Options: 'following', 'popular'
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const observer = useRef();
  const TRACKS_PER_PAGE = 5;
  const { isAuthenticated, isLoading } = useUser();
  const { isMobile } = useMobile();
  const [hasSponsoredCompetition, setHasSponsoredCompetition] = useState(false);

  // Check if this is the first visit when component mounts
  useEffect(() => {
    const hasVisitedBefore = localStorage.getItem('sterio_visited');
    if (!hasVisitedBefore) {
      setShowWelcomeDialog(true);
      // Set the flag in localStorage so dialog won't show on future visits
      localStorage.setItem('sterio_visited', 'true');
    }
  }, []);

  useEffect(() => {
    // Only set feed type after authentication check is complete
    if (!isLoading) {
      if (isAuthenticated) {
        setFeedType('following');
      } else {
        setFeedType('popular');
      }
    }
  }, [isAuthenticated, isLoading]);

  const closeWelcomeDialog = () => {
    setShowWelcomeDialog(false);
    trackWelcomeDialogClose();
  };

  const lastTrackElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const fetchTracks = useCallback(async (pageNum, feedTypeValue) => {
    try {
      setLoading(true);
      
      // Call the appropriate endpoint based on feedType
      const endpoint = `/tracks/feed/${feedTypeValue}`;
      
      const response = await api.get(endpoint, {
        params: {
          page: pageNum,
          limit: TRACKS_PER_PAGE
        }
      });
      
      if (pageNum === 1) {
        setTracks(response.data);
      } else {
        setTracks(prevTracks => [...prevTracks, ...response.data]);
      }
      
      setHasMore(response.data.length === TRACKS_PER_PAGE);
      setError('');
    } catch (err) {
      console.error('Failed to fetch tracks:', err);
      setError('Failed to load tracks. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch tracks when feed type is properly initialized
    if (feedType) {
      setPage(1);
      setTracks([]);
      fetchTracks(1, feedType);
    }
  }, [feedType, fetchTracks]);

  useEffect(() => {
    // Only fetch additional pages when feed type is properly initialized
    if (page > 1 && feedType) {
      fetchTracks(page, feedType);
    }
  }, [page, feedType, fetchTracks]);

  const handleFeedTypeChange = (newFeedType) => {
    if (newFeedType !== feedType) {
      setFeedType(newFeedType);
      setExpandedTrackId(null);
      trackFeedChange(newFeedType);
    }
  };

  // Enhanced track expansion handler with analytics
  const handleTrackExpansion = (trackId) => {
    if (expandedTrackId !== trackId) {
      const track = tracks.find(t => t.id === trackId);
      if (track) {
        trackTrackExpand(trackId, track.title, track.username);
      }
    }
    setExpandedTrackId(expandedTrackId === trackId ? null : trackId);
  };

  // Create tabs configuration
  const tabs = [
    // { key: 'for-you', label: 'For You' },
    ...(isAuthenticated ? [{ key: 'following', label: 'Following' }] : []),
    { key: 'popular', label: 'Popular' }
  ];

  return (
    <div className={styles.feedContainer}>
      {/* Welcome Dialog for first-time visitors */}
      {showWelcomeDialog && (
        <div className="modal-overlay active" onClick={(e) => {
          if (e.target.className === 'modal-overlay active') {
            closeWelcomeDialog();
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Welcome to sterio!</h2>
              <button 
                className="close-btn" 
                onClick={closeWelcomeDialog}
                aria-label="Close welcome dialog"
              >
                <FaTimes />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                <FaMusic style={{ fontSize: '48px', color: 'var(--primary-color)', marginBottom: '16px',  justifySelf: 'center'}} />
                <p style={{ fontSize: '16px', marginBottom: '24px' }}>
                  sterio is a social platform where musicians can collaborate with each other!
                </p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary, #f0f0f0)' }}>
                  <FaMicrophone style={{ fontSize: '32px', color: 'var(--primary-color)', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Create or Collaborate</h3>
                  <p style={{ fontSize: '14px', textAlign: 'center' }}>
                    Upload your own music tracks or add your sounds to existing tracks
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary, #f0f0f0)' }}>
                  <FaInfoCircle style={{ fontSize: '32px', color: 'var(--primary-color)', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>How It Works</h3>
                  <p style={{ fontSize: '14px', textAlign: 'center' }}>
                    Browse tracks, click on one to expand and see all collaborations
                  </p>
                </div>
              </div>
              
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  Ready to get started?
                </p>
                <p style={{ fontSize: '14px' }}>
                  Browse tracks below or upload your own to join the community!
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="pill-btn gradient-btn sm"
                onClick={closeWelcomeDialog}
              >
                Let&apos;s Go!
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className={styles.feedHeader}>
        <h1 className={styles.feedTitle}>Home Feed</h1>
        <p className={styles.feedSubtitle}>
          Check out the latest tracks from artists you follow and trending collaborations
        </p>
        
        {feedType ? (
          <CustomTabs
            tabs={tabs}
            activeTab={feedType}
            onTabChange={handleFeedTypeChange}
            variant="feed"
          />
        ) : (
          <div className={styles.feedTabs}>
            <div className={styles.loadingTabs}>Loading...</div>
          </div>
        )}
      </div>

      {/* Mobile Banner - Show sponsored competition above feed on mobile */}
      {isMobile && hasSponsoredCompetition && (
        <SponsoredCompetition variant="banner" />
      )}

      {error && <p className={styles.errorMessage}>{error}</p>}
      
      {/* Desktop Layout - Feed with Sidebar */}
      <div className={styles.homeLayout}>
        <div className={styles.feedContent}>
          <div className={styles.feed}>
        {tracks.length === 0 && !loading ? (
          <div className={styles.emptyFeed}>
            <p>
              {feedType === 'following' 
                ? "You're not following any artists yet. Follow some artists to see their tracks here!"
                : "No tracks available. Check back later or try a different feed type."}
            </p>
          </div>
        ) : (
          <div className={styles.trackList}>
            {tracks.map((track, index) => (
              <div 
                key={track.id} 
                ref={index === tracks.length - 1 ? lastTrackElementRef : null}
              >
                <Track
                  track={track}
                  allTracks={tracks}
                  expandedTrackId={expandedTrackId}
                  setExpandedTrackId={handleTrackExpansion}
                />
              </div>
            ))}
          </div>
        )}
        
            {loading && (
              <LoadingSpinner />
            )}
          </div>
        </div>
        
        {/* Desktop Sidebar - Show sponsored competition on desktop */}
        {!isMobile && hasSponsoredCompetition && (
          <div className={styles.sidebar}>
            <SponsoredCompetition 
              variant="sidebar" 
              setHasSponsoredCompetition={setHasSponsoredCompetition}
            />
          </div>
        )}
      </div>
    </div>
  );
}