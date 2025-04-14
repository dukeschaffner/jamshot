'use client';
import React, { useState, useEffect } from 'react';
import { useAudio } from '../lib/AudioContext';
import { FaPlay, FaPause, FaHeart, FaRegHeart, FaRetweet, FaCheckCircle, FaMusic } from 'react-icons/fa';
import Cookies from 'js-cookie';
import api from '../lib/api';
import { useRouter } from 'next/navigation';
import TimeDisplay from './TimeDisplay';

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
  
  useEffect(() => {
    // Update like state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
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
    e.stopPropagation();
    router.push(`/tree/${track.id}`);
  };
  
  const handleLikeToggle = async (e) => {
    e.stopPropagation();
    
    try {
      const token = Cookies.get('accessToken');
      if (!token) {
        // Handle unauthenticated user
        console.log('Please log in to like tracks');
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
  
  const handleRepostToggle = async (e) => {
    e.stopPropagation();
    
    try {
      const token = Cookies.get('accessToken');
      if (!token) {
        // Handle unauthenticated user
        console.log('Please log in to repost tracks');
        return;
      }
      
      if (track.is_reposted) {
        await api.delete(`/tracks/${track.id}/repost`);
        track.is_reposted = false;
      } else {
        await api.post(`/tracks/${track.id}/repost`);
        track.is_reposted = true;
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
    <div className={`related-track ${isTreeView && trackTreeIds && trackTreeIds.includes(track.id) ? 'selected' : ''}`}>
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
          {track.metronome_bpm && (
            <div className="metronome-info">
              <FaMusic className="metronome-icon" /> {track.metronome_bpm} BPM
            </div>
          )}
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
            className="link-underline"
            onClick={navigateToUserProfile}
          >
            {track.username || 'Unknown Artist'}
            {track.verified && <FaCheckCircle className="verified-icon" />}
          </span>
          {track.created_at && (
            <TimeDisplay timestamp={track.created_at} />
          )}
        </div>
      </div>
      <div className="related-actions">
        <div className="related-meta">
          <div className="meta-item">
            <FaPlay /> <span>{Number(track.play_count || 0).toLocaleString()}</span>
          </div>
          <div className="meta-item">
            <FaHeart /> <span>{Number(track.like_count || likeCount || 0).toLocaleString()}</span>
          </div>
        </div>
        <div className="related-buttons">
          {isTreeView && !(trackTreeIds && trackTreeIds.includes(track.id)) && (
            <button 
              className="select-btn"
              onClick={handleSelectTrack}
              title="Select track"
            >
              Select
            </button>
          )}
          <button 
            className={`like-btn ${isLiked ? 'active' : ''}`}
            onClick={handleLikeToggle}
          >
            {isLiked ? <FaHeart /> : <FaRegHeart />}
          </button>
          <button 
            className={`repost-btn ${track.is_reposted ? 'active' : ''}`}
            onClick={handleRepostToggle}
          >
            <FaRetweet />
          </button>
        </div>
      </div>
    </div>
  );
}