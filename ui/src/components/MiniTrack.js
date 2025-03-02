'use client';
import { useState, useEffect } from 'react';
import { useAudio } from '../lib/AudioContext';
import { FaHeart, FaRegHeart, FaRetweet } from 'react-icons/fa';
import TrackTags from './TrackTags';
import api from '../lib/api';
import Cookies from 'js-cookie';

export default function MiniTrack({ track, relatedTracks = [] }) {
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);
  const [isLikeInProgress, setIsLikeInProgress] = useState(false);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [isRepostInProgress, setIsRepostInProgress] = useState(false);

  useEffect(() => {
    // Update like and repost state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
    setIsReposted(track.is_reposted || false);
  }, [track.is_liked, track.like_count, track.is_reposted]);

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    console.log('Playing track:', track);
    if (currentTrack?.id === track.id) {
      console.log('Toggling play/pause for:', track.title);
      togglePlayPause();
    } else {
      const currentIndex = relatedTracks.findIndex(t => t.id === track.id);
      const tracksToAdd = currentIndex >= 0 ? relatedTracks.slice(currentIndex + 1) : []; // Exclude current
      console.log('Overwriting playlist with:', tracksToAdd.map(t => t.title));
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

  return (
    <div className="flex items-center space-x-2 p-2 bg-s2 rounded">
      <button
        onClick={handlePlayToggle}
        className={`w-8 h-8 rounded-full text-white flex items-center justify-center ${
          currentTrack?.id === track.id && isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
        }`}
      >
        {currentTrack?.id === track.id && isPlaying ? '❚❚' : '▶'}
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium">{track.title}</p>
        {(track.genres?.length > 0 || track.instruments?.length > 0) && (
          <TrackTags 
            genres={track.genres || []} 
            instruments={track.instruments || []} 
            compact={true} 
          />
        )}
      </div>
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1">
          <button 
            onClick={handleLikeToggle} 
            className={`text-red-500 focus:outline-none ${isLikeInProgress ? 'opacity-50' : ''}`}
            disabled={!Cookies.get('token') || isLikeInProgress} // Disable if not logged in or in progress
            title={Cookies.get('token') ? (isLiked ? 'Unlike' : 'Like') : 'Log in to like tracks'}
          >
            {isLiked ? <FaHeart /> : <FaRegHeart />}
          </button>
          <span className="text-xs text-gray-600">{Number(likeCount)}</span>
        </div>
        <button 
          onClick={handleRepostToggle} 
          className={`focus:outline-none ${isReposted ? 'text-green-500' : 'text-gray-500'} ${isRepostInProgress ? 'opacity-50' : ''}`}
          disabled={!Cookies.get('token') || isRepostInProgress} // Disable if not logged in or in progress
          title={Cookies.get('token') ? (isReposted ? 'Unrepost' : 'Repost') : 'Log in to repost tracks'}
        >
          <FaRetweet size={14} />
        </button>
      </div>
    </div>
  );
}