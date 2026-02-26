'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FaCheckCircle, FaPlay, FaPause } from 'react-icons/fa';
import { useAudio } from '../../../../lib/AudioContext';
import { useLoopListening } from '../utils/LoopListeningContext';
import TrackTags from '../../../../components/TrackTags';
import TrackMeta from '../../../../components/TrackMeta';
import styles from './TrackPopover.module.css';

export default function TrackPopover({ track, position, onClose, onMouseEnter, isLoopMode = false, onTrackLikeUpdate }) {
  const router = useRouter();
  const regularAudio = useAudio();
  let loopListening;
  
  try {
    loopListening = useLoopListening();
  } catch (e) {
    // Loop listening context not available, will use regular audio
    loopListening = null;
  }
  
  // Use loop listening if available and requested, otherwise use regular audio
  const audioContext = (isLoopMode && loopListening) ? loopListening : regularAudio;
  const { currentTrack, isPlaying, playTrack, togglePlayPause, queueTrack } = audioContext;
  
  const popoverRef = useRef(null);

  const isCurrentTrack = currentTrack?.id === track?.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;

  const handlePlayPause = () => {
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  };
  
  const handleQueue = () => {
    if (isLoopMode && queueTrack) {
      queueTrack(track);
    }
  };

  const navigateToUserProfile = (e) => {
    e.stopPropagation();
    if (track?.username) {
      router.push(`/user/${track.username}`);
    }
  };

  const navigateToTrack = (e) => {
    e.stopPropagation();
    if (track?.guid) {
      router.push(`/track/${track.guid}`);
    }
  };

  if (!track) return null;

  return (
    <div
      ref={popoverRef}
      className={styles['track-popover']}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y + 10}px`,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
    >
      <div className={styles['popover-content']}>
        <div className={styles['popover-header']}>
          <Image
            src={track?.profile_pic_url || '/avatar.svg'}
            alt={track?.username || 'Artist'}
            width={40}
            height={40}
            className={`${styles['popover-avatar']} ${track?.username ? styles.clickable : ''}`}
            onClick={track?.username ? navigateToUserProfile : undefined}
            role={track?.username ? 'button' : undefined}
          />
          <div className={styles['popover-artist-info']}>
            <div className={styles['popover-artist-name']}>
              <span
                className={track?.username ? 'link-underline' : ''}
                onClick={track?.username ? navigateToUserProfile : undefined}
                role={track?.username ? 'button' : undefined}
              >
                {track?.username || 'Unknown Artist'}
              </span>
              {track?.verified && (
                <FaCheckCircle className={styles['verified-icon']} />
              )}
            </div>
            <div className={styles['popover-track-title']}>
              <span
                className={track?.guid ? 'link-underline' : ''}
                onClick={track?.guid ? navigateToTrack : undefined}
                role={track?.guid ? 'button' : undefined}
              >
                {track?.title}
              </span>
            </div>
          </div>
        </div>

        <div className={styles['popover-meta']}>
          <TrackMeta track={track} variant="mini" onTrackLikeUpdate={onTrackLikeUpdate} />
        </div>

        <div className={styles['popover-buttons']}>
          <button
            className={styles['popover-play-button']}
            onClick={handlePlayPause}
          >
            {isCurrentlyPlaying ? (
              <>
                <FaPause /> Pause
              </>
            ) : (
              <>
                <FaPlay /> Play
              </>
            )}
          </button>
          {isLoopMode && queueTrack && (
            <button
              className={styles['popover-queue-button']}
              onClick={handleQueue}
            >
              Queue
            </button>
          )}
        </div>

        <div className={styles['popover-tags']}>
          <TrackTags track={track} variant="light" />
        </div>
      </div>
    </div>
  );
}

