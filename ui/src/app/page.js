'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../lib/api';
import Track from '../components/Track';
import { FaSpinner } from 'react-icons/fa';

export default function Home() {
  const [tracks, setTracks] = useState([]);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [feedType, setFeedType] = useState('mixed'); // 'mixed', 'following', 'popular'
  const observer = useRef();
  const TRACKS_PER_PAGE = 5;

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