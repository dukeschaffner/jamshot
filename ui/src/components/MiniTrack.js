'use client';
import React, { useState, useEffect } from 'react';
import { useAudio } from '../lib/AudioContext';
import { FaPlay, FaPause, FaHeart, FaRegHeart, FaRetweet, FaCheckCircle, FaMusic } from 'react-icons/fa';
import Cookies from 'js-cookie';
import api from '../lib/api';
import { useRouter } from 'next/navigation';
import TimeDisplay from './TimeDisplay';
import UserListModal from './UserListModal';
import { useUser } from '../contexts/UserContext';
import { getLikeCountString } from '../lib/utils';
export default function MiniTrack(
  { 
    track, 
    relatedTracks = [], 
    isTreeView = false, // Used in tree view
    trackTreeIds // Used in tree view
  }
) {
  const router = useRouter();
  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useAudio();
  const isCurrentTrack = currentTrack?.id === track.id;
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [repostCount, setRepostCount] = useState(Number(track.repost_count) || 0);
  const { user: currentUser, isAuthenticated } = useUser();
  const [showLikesModal, setShowLikesModal] = useState(false);
  
  useEffect(() => {
    // Update like state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
    setIsReposted(track.is_reposted || false);
    setRepostCount(Number(track.repost_count) || 0);
  }, [track]);
  
  const handlePlayToggle = (e) => {
    e.stopPropagation();
    
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      const currentIndex = relatedTracks.findIndex(t => t.id === track.id);
      const tracksToAdd = currentIndex >= 0 ? relatedTracks.slice(currentIndex + 1) : [];
      playTrack(track, tracksToAdd);
    }
  };
  
  const handleSelectTrack = (e) => {
    if(isTreeView) {
      e.stopPropagation();
      router.push(`/tree/${track.id}`);
    }
  };
  
  const handleLikeToggle = async (e) => {
    e.stopPropagation();
    
    try {
      if (!isAuthenticated) {
        // Handle unauthenticated user
        alert('Please log in to like tracks');
        return;
      }
      
      if (isLiked) {
        await api.delete(`/tracks/${track.id}/like`);
        setIsLiked(false);
        setLikeCount(prevCount => Math.max(0, Number(prevCount) - 1));
      } else {
        await api.post(`/tracks/${track.id}/like`);
        setIsLiked(true);
        setLikeCount(prevCount => Number(prevCount) + 1);
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };
  
  const handleLikeCountClick = (e) => {
    e.stopPropagation();
    if (likeCount > 0) {
      setShowLikesModal(true);
    }
  };
  
  const handleRepostToggle = async (e) => {
    e.stopPropagation();
    
    try {
      if (!isAuthenticated) {
        // Handle unauthenticated user
        console.log('Please log in to like tracks');
        return;
      }
      
      if (track.is_reposted) {
        await api.delete(`/tracks/${track.id}/repost`);
        setIsReposted(false);
        setRepostCount(prevCount => Math.max(0, Number(prevCount) - 1));
      } else {
        await api.post(`/tracks/${track.id}/repost`);
        setIsReposted(true);
        setRepostCount(prevCount => Number(prevCount) + 1);
      }
    } catch (error) {
      console.error('Failed to toggle repost:', error);
    }
  };
  
  const navigateToUserProfile = (e) => {
    e.stopPropagation();
    router.push(`/user/${track.username}`);
  };
  
  const navigateToTrack = (e) => {
    e.stopPropagation();
    router.push(`/track/${track.id}`);
  };
  
  return (
    <div 
      className={`related-track ${isTreeView && trackTreeIds && trackTreeIds.includes(track.id) ? 'selected' : 'cursor-pointer'}`}
      onClick={handleSelectTrack}
    >
      <div className="related-play" onClick={handlePlayToggle}>
        {isPlaying && isCurrentTrack ? <FaPause /> : <FaPlay />}
      </div>
      <div className="related-info">
        <div className="related-title-container">
          <div className="related-title">
            <span className="link-underline" onClick={navigateToTrack}>
              {track.title}
            </span>
          </div>
          {(track.tags?.length > 0 || track.genres?.length > 0 || track.instruments?.length > 0) && (
            <div className="related-tags">
              {/* Display regular tags */}
              {track.tags && Array.isArray(track.tags) && track.tags.map((tag, index) => (
                <span key={`tag-${index}`} className="track-tag mini">
                  {typeof tag === 'string' ? tag : tag.name}
                </span>
              ))}
              
              {/* Display genres */}
              {track.genres && Array.isArray(track.genres) && track.genres.map((genre, index) => (
                <span key={`genre-${index}`} className="track-tag mini">
                  {typeof genre === 'string' ? genre : genre.name}
                </span>
              ))}
              
              {/* Display instruments */}
              {track.instruments && Array.isArray(track.instruments) && track.instruments.map((instrument, index) => (
                <span key={`instrument-${index}`} className="track-tag mini">
                  {typeof instrument === 'string' ? instrument : instrument.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="related-artist">
          <span 
            className="link-underline artist-name-mini"
            onClick={navigateToUserProfile}
          >
            {track.username || 'Unknown Artist'}
            {track.verified && <FaCheckCircle className="verified-icon" />}
          </span>
        </div>
      </div>
      <div className="related-actions">
        {track.created_at && (
          <TimeDisplay timestamp={track.created_at} />
        )}
        <div className="related-meta">
          <div className="meta-item">
            <FaPlay /> <span>{Number(track.play_count || 0).toLocaleString()}</span>
          </div>
          <div className="meta-item">
            <button 
              className={`like-btn ${isLiked ? 'active' : ''}`}
              onClick={handleLikeToggle}
              disabled={!isAuthenticated}
            >
              {isLiked ? <FaHeart /> : <FaRegHeart />}
            </button>
            <span 
              className={`like-count ${likeCount > 0 ? 'link-underline' : ''}`}
              onClick={handleLikeCountClick}
              title={likeCount > 0 ? 'View likes' : ''}
            >
              {getLikeCountString(likeCount)}
            </span>
          </div>
          <div className="meta-item">
            <button 
              className={`repost-btn ${isReposted ? 'active' : ''}`}
              onClick={handleRepostToggle}
              disabled={!isAuthenticated}
            >
              <FaRetweet />
            </button>
            <span>{Number(repostCount || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <UserListModal
        isOpen={showLikesModal}
        onClose={() => setShowLikesModal(false)}
        title="Likes"
        type="likes"
        trackId={track.id}
      />
    </div>
  );
}