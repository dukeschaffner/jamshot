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
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Your Feed</h1>
        <p className="text-gray-600 mb-4">
          Discover new tracks from artists you follow and trending collaborations
        </p>
        
        <div className="flex space-x-2 mb-4">
          <button
            onClick={() => handleFeedTypeChange('mixed')}
            className={`px-4 py-2 rounded-full ${
              feedType === 'mixed' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            For You
          </button>
          <button
            onClick={() => handleFeedTypeChange('following')}
            className={`px-4 py-2 rounded-full ${
              feedType === 'following' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            Following
          </button>
          <button
            onClick={() => handleFeedTypeChange('popular')}
            className={`px-4 py-2 rounded-full ${
              feedType === 'popular' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            Popular
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      
      {tracks.length === 0 && !loading ? (
        <div className="bg-gray-100 p-6 rounded-lg text-center">
          <p className="text-gray-600">
            {feedType === 'following' 
              ? "You're not following any artists yet. Follow some artists to see their tracks here!"
              : "No tracks available. Check back later or try a different feed type."}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {tracks.map((track, index) => (
            <li 
              key={track.id} 
              ref={index === tracks.length - 1 ? lastTrackElementRef : null}
            >
              <Track
                track={track}
                allTracks={tracks}
                expandedTrackId={expandedTrackId}
                setExpandedTrackId={setExpandedTrackId}
              />
            </li>
          ))}
        </ul>
      )}
      
      {loading && (
        <div className="flex justify-center my-6">
          <FaSpinner className="animate-spin text-blue-500 text-2xl" />
        </div>
      )}
    </div>
  );
}