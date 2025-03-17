'use client';
import React, { useState, useEffect } from 'react';
import { useAudio } from '../lib/AudioContext';
import { FaPlay, FaPause, FaHeart, FaRegHeart, FaRetweet, FaCheckCircle, FaMusic } from 'react-icons/fa';
import Cookies from 'js-cookie';
import api from '../lib/api';
import { useRouter } from 'next/navigation';

export default function MiniTrack({ track, relatedTracks = [] }) {
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
  
  const handleLikeToggle = async (e) => {
    e.stopPropagation();
    
    try {
      const token = Cookies.get('token');
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
      const token = Cookies.get('token');
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
  
  return (
    <div className="related-track">
      <div className="related-play" onClick={handlePlayToggle}>
        {isPlaying && isCurrentTrack ? <FaPause /> : <FaPlay />}
      </div>
      <div className="related-info">
        <div className="related-title-container">
          <div className="related-title">{track.title}</div>
          {track.metronome_bpm && (
            <div className="metronome-info">
              <FaMusic className="metronome-icon" /> {track.metronome_bpm} BPM
            </div>
          )}
          {(track.tags?.length > 0 || track.genres?.length > 0 || track.instruments?.length > 0) && (
            <div className="related-tags">
              {/* Display regular tags */}
              {track.tags && Array.isArray(track.tags) && track.tags.map((tag, index) => (
                <span key={`tag-${index}`} className="track-tag">
                  {typeof tag === 'string' ? tag : tag.name}
                </span>
              ))}
              
              {/* Display genres */}
              {track.genres && Array.isArray(track.genres) && track.genres.map((genre, index) => (
                <span key={`genre-${index}`} className="track-tag">
                  {typeof genre === 'string' ? genre : genre.name}
                </span>
              ))}
              
              {/* Display instruments */}
              {track.instruments && Array.isArray(track.instruments) && track.instruments.map((instrument, index) => (
                <span key={`instrument-${index}`} className="track-tag">
                  {typeof instrument === 'string' ? instrument : instrument.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="related-artist">
          <span 
            className="artist-name"
            onClick={navigateToUserProfile}
          >
            {track.username || 'Unknown Artist'}
            {track.verified && <FaCheckCircle className="verified-icon" />}
          </span>
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
      
      <style jsx>{`
        .artist-name {
          cursor: pointer;
          transition: text-decoration 0.2s ease;
        }
        .artist-name:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}