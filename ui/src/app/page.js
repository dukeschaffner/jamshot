'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../lib/api';
import Track from '../components/Track';
import { FaSpinner, FaTimes, FaInfoCircle, FaMicrophone, FaCode, FaMusic } from 'react-icons/fa';

export default function Home() {
  const [tracks, setTracks] = useState([]);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [feedType, setFeedType] = useState('mixed'); // 'mixed', 'following', 'popular'
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const observer = useRef();
  const TRACKS_PER_PAGE = 5;

  // Check if this is the first visit when component mounts
  useEffect(() => {
    const hasVisitedBefore = localStorage.getItem('jamshot_visited');
    if (!hasVisitedBefore) {
      setShowWelcomeDialog(true);
      // Set the flag in localStorage so dialog won't show on future visits
      localStorage.setItem('jamshot_visited', 'true');
    }
  }, []);

  const closeWelcomeDialog = () => {
    setShowWelcomeDialog(false);
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
      const response = await api.get('/tracks/feed', {
        params: {
          page: pageNum,
          limit: TRACKS_PER_PAGE,
          feedType: feedTypeValue
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
    setPage(1);
    setTracks([]);
    fetchTracks(1, feedType);
  }, [feedType, fetchTracks]);

  useEffect(() => {
    if (page > 1) {
      fetchTracks(page, feedType);
    }
  }, [page, feedType, fetchTracks]);

  const handleFeedTypeChange = (newFeedType) => {
    if (newFeedType !== feedType) {
      setFeedType(newFeedType);
      setExpandedTrackId(null);
    }
  };

  return (
    <div className="feed-container">
      {/* Welcome Dialog for first-time visitors */}
      {showWelcomeDialog && (
        <div className="modal-overlay active" onClick={(e) => {
          if (e.target.className === 'modal-overlay active') {
            closeWelcomeDialog();
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Welcome to JamShot!</h2>
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
                <FaMusic style={{ fontSize: '48px', color: 'var(--primary-color)', marginBottom: '16px' }} />
                <p style={{ fontSize: '16px', marginBottom: '24px' }}>
                  JamShot is a social platform where musicians can collaborate with each other!
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
                className="save-btn"
                onClick={closeWelcomeDialog}
              >
                Let&apos;s Go!
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="feed-header">
        <h1 className="feed-title">Home Feed</h1>
        <p className="feed-subtitle">
          Check out the latest tracks from artists you follow and trending collaborations
        </p>
        
        <div className="feed-tabs">
          <button
            onClick={() => handleFeedTypeChange('mixed')}
            className={`feed-tab ${feedType === 'mixed' ? 'active' : ''}`}
          >
            For You
          </button>
          <button
            onClick={() => handleFeedTypeChange('following')}
            className={`feed-tab ${feedType === 'following' ? 'active' : ''}`}
          >
            Following
          </button>
          <button
            onClick={() => handleFeedTypeChange('popular')}
            className={`feed-tab ${feedType === 'popular' ? 'active' : ''}`}
          >
            Popular
          </button>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}
      
      <div className="feed">
        {tracks.length === 0 && !loading ? (
          <div className="empty-feed">
            <p>
              {feedType === 'following' 
                ? "You're not following any artists yet. Follow some artists to see their tracks here!"
                : "No tracks available. Check back later or try a different feed type."}
            </p>
          </div>
        ) : (
          <div className="track-list">
            {tracks.map((track, index) => (
              <div 
                key={track.id} 
                ref={index === tracks.length - 1 ? lastTrackElementRef : null}
              >
                <Track
                  track={track}
                  allTracks={tracks}
                  expandedTrackId={expandedTrackId}
                  setExpandedTrackId={setExpandedTrackId}
                />
              </div>
            ))}
          </div>
        )}
        
        {loading && (
          <div className="loading-spinner">
            <FaSpinner className="spinner-icon" />
          </div>
        )}
      </div>
    </div>
  );
}