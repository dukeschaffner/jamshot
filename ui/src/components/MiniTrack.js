'use client';
import React, { useState, useEffect } from 'react';
import { useAudio } from '../lib/AudioContext';
import { FaPlay, FaPause, FaHeart, FaRegHeart, FaRetweet, FaCheckCircle, FaMusic } from 'react-icons/fa';
import Cookies from 'js-cookie';
import api from '../lib/api';
import { useRouter } from 'next/navigation';
import TimeDisplay from './TimeDisplay';
import UserListModal from './UserListModal';
import TrackMeta from './TrackMeta';
import { useUser } from '../contexts/UserContext';
import { getLikeCountString } from '../lib/utils';
import styles from './MiniTrack.module.css';

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
  const { user: currentUser, isAuthenticated } = useUser();
  
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
      className={`${styles.miniTrackTrack} ${isTreeView && trackTreeIds && trackTreeIds.includes(track.id) ? styles.selected : 'cursor-pointer'}`}
      onClick={handleSelectTrack}
    >
      <div className={styles.miniTrackPlay} onClick={handlePlayToggle}>
        {isPlaying && isCurrentTrack ? <FaPause /> : <FaPlay />}
      </div>
      <div className={styles.miniTrackInfo}>
        <div className={styles.miniTrackTitleContainer}>
          <div className={styles.miniTrackTitle}>
            <span className="link-underline" onClick={navigateToTrack}>
              {track.title}
            </span>
          </div>
          {(track.tags?.length > 0 || track.genres?.length > 0 || track.instruments?.length > 0) && (
            <div className={styles.miniTrackTags}>
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
        <div className={styles.miniTrackArtist}>
          <span 
            className="link-underline artist-name"
            onClick={navigateToUserProfile}
          >
            {track.username || 'Unknown Artist'}
            {track.verified && <FaCheckCircle className="verified-icon" />}
          </span>
        </div>
      </div>
      <div className={styles.miniTrackActions}>
        {track.created_at && (
          <TimeDisplay timestamp={track.created_at} />
        )}
        <TrackMeta 
          track={track}
          variant='mini'
        />
      </div>
    </div>
  );
}