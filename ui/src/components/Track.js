'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import MiniTrack from './MiniTrack';
import TrackTags from './TrackTags';
import { useAudio } from '../lib/AudioContext';
import { FaCheckCircle, FaHeart, FaRegHeart, FaRetweet } from 'react-icons/fa';
import Cookies from 'js-cookie';

export default function Track({ track, allTracks, setExpandedTrackId, expandedTrackId }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [relatedTracks, setRelatedTracks] = useState([]);
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);
  const [isLikeInProgress, setIsLikeInProgress] = useState(false);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [isRepostInProgress, setIsRepostInProgress] = useState(false);

  useEffect(() => {
    setIsExpanded(expandedTrackId === track.id);
    if (expandedTrackId === track.id) {
      const fetchRelatedTracks = async () => {
        try {
          const response = await api.get(`/tracks/${track.id}/related`);
          setRelatedTracks(response.data);
        } catch (err) {
          console.error('Failed to fetch related tracks:', err);
        }
      };
      fetchRelatedTracks();
    }
  }, [expandedTrackId, track.id]);

  useEffect(() => {
    // Update like and repost state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
    setIsReposted(track.is_reposted || false);
  }, [track.is_liked, track.like_count, track.is_reposted]);

  const toggleExpand = () => {
    setExpandedTrackId(isExpanded ? null : track.id);
  };

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    if (currentTrack?.id === track.id) {
      console.log('Toggling play/pause for:', track.title);
      togglePlayPause();
    } else {
      const currentIndex = allTracks.findIndex(t => t.id === track.id);
      const tracksToAdd = allTracks.slice(currentIndex + 1); // Exclude current track
      console.log('Playing with subsequent tracks:', tracksToAdd.map(t => t.title));
      playTrack(track, tracksToAdd);
    }
  };

  const handleLikeToggle = async (e) => {
    e.stopPropagation();
    
    // Prevent action if already in progress
    if (isLikeInProgress) return;
    setIsLikeInProgress(true);
    
    try {
      if (isLiked) {
        await api.delete(`/tracks/${track.id}/like`);
        setIsLiked(false);
        setLikeCount(prevCount => Math.max(0, Number(prevCount) - 1));
      } else {
        await api.post(`/tracks/${track.id}/like`);
        setIsLiked(true);
        setLikeCount(prevCount => Number(prevCount) + 1);
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
      // If there's an error, revert the UI state
      if (err.response && err.response.status === 401) {
        // User is not authenticated
        alert('Please log in to like tracks');
      }
    } finally {
      setIsLikeInProgress(false);
    }
  };

  const handleRepostToggle = async (e) => {
    e.stopPropagation();
    
    // Prevent action if already in progress
    if (isRepostInProgress) return;
    
    const token = Cookies.get('token');
    if (!token) {
      alert('Please log in to repost tracks');
      return;
    }
    
    setIsRepostInProgress(true);
    
    try {
      if (isReposted) {
        await api.delete(`/tracks/${track.id}/repost`);
        setIsReposted(false);
      } else {
        await api.post(`/tracks/${track.id}/repost`);
        setIsReposted(true);
      }
    } catch (err) {
      console.error('Failed to toggle repost:', err);
      if (err.response && err.response.status === 400) {
        alert(err.response.data.error || 'Cannot repost this track');
      } else if (err.response && err.response.status === 401) {
        alert('Please log in to repost tracks');
      } else {
        alert('Failed to repost track');
      }
    } finally {
      setIsRepostInProgress(false);
    }
  };

  const originalTrack = relatedTracks.find(t => t.id === track.parent_track_id);
  const collabTracks = relatedTracks.filter(t => t.parent_track_id === track.id);

  return (
    <div className={`bg-p1 rounded-lg shadow-md overflow-hidden transition-all duration-300 ${isExpanded ? 'mb-4' : 'mb-2'}`}>
      {track.is_repost && track.reposted_by_username && (
        <div className="bg-gray-100 px-4 py-1 text-xs text-gray-600 flex items-center">
          <FaRetweet className="mr-1" /> Reposted by {track.reposted_by_username}
        </div>
      )}
      <div 
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={toggleExpand}
      >
        <div className="p-4 flex items-center space-x-4">
          <button
            onClick={handlePlayToggle}
            className={`w-10 h-10 flex items-center justify-center rounded-full ${
              currentTrack?.id === track.id && isPlaying
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white focus:outline-none transition-colors`}
          >
            {currentTrack?.id === track.id && isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-semibold text-gray-800">{track.title}</h2>
              {track.verified && (
                <FaCheckCircle className="text-blue-500" title="Verified Artist" />
              )}
            </div>
            <p className="text-sm text-gray-600">by {track.username}</p>
            {track.layer > 0 && (
              <p className="text-sm text-gray-600">Layer: {track.layer} (Based on: {track.original_title})</p>
            )}
            
            {/* Display tags */}
            <TrackTags 
              genres={track.genres || []} 
              instruments={track.instruments || []} 
              compact={true} 
            />
            
            <div className="flex items-center space-x-4 mt-1">
              <p className="text-sm text-gray-600">{track.collab_count} collabs</p>
              <div className="flex items-center space-x-1">
                <button 
                  onClick={handleLikeToggle} 
                  className={`text-red-500 focus:outline-none ${isLikeInProgress ? 'opacity-50' : ''}`}
                  disabled={!Cookies.get('token') || isLikeInProgress} // Disable if not logged in or in progress
                  title={Cookies.get('token') ? (isLiked ? 'Unlike' : 'Like') : 'Log in to like tracks'}
                >
                  {isLiked ? <FaHeart /> : <FaRegHeart />}
                </button>
                <span className="text-sm text-gray-600">{Number(likeCount)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <button 
                  onClick={handleRepostToggle} 
                  className={`focus:outline-none ${isReposted ? 'text-green-500' : 'text-gray-500'} ${isRepostInProgress ? 'opacity-50' : ''}`}
                  disabled={!Cookies.get('token') || isRepostInProgress} // Disable if not logged in or in progress
                  title={Cookies.get('token') ? (isReposted ? 'Unrepost' : 'Repost') : 'Log in to repost tracks'}
                >
                  <FaRetweet />
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/collaborate/${track.id}`);
            }}
            className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Collaborate
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {/* Display full tags when expanded */}
          {(track.genres?.length > 0 || track.instruments?.length > 0) && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-1">Tags</h3>
              <TrackTags 
                genres={track.genres || []} 
                instruments={track.instruments || []} 
              />
            </div>
          )}
          
          {originalTrack && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700">Original Track</h3>
              <MiniTrack track={originalTrack} relatedTracks={relatedTracks} />
            </div>
          )}
          {collabTracks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">Collaborations</h3>
              <div className="space-y-2">
                {collabTracks.map(collab => (
                  <MiniTrack key={collab.id} track={collab} relatedTracks={relatedTracks} />
                ))}
              </div>
            </div>
          )}
          {(!originalTrack && collabTracks.length === 0) && (
            <p className="text-gray-600">No related tracks yet.</p>
          )}
        </div>
      )}
    </div>
  );
}