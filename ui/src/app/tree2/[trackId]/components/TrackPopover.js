'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { FaCheckCircle, FaPlay, FaPause } from 'react-icons/fa';
import { useAudio } from '../../../../lib/AudioContext';
import styles from './TrackPopover.module.css';

export default function TrackPopover({ track, position, onClose, onMouseEnter }) {
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  const popoverRef = useRef(null);

  const isCurrentTrack = currentTrack?.id === track?.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;

  const handlePlayPause = () => {
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrack(track, 'tree-view');
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
            className={styles['popover-avatar']}
          />
          <div className={styles['popover-artist-info']}>
            <div className={styles['popover-artist-name']}>
              {track?.username || 'Unknown Artist'}
              {track?.verified && (
                <FaCheckCircle className={styles['verified-icon']} />
              )}
            </div>
            <div className={styles['popover-track-title']}>{track?.title}</div>
          </div>
        </div>

        <div className={styles['popover-stats']}>
          <div className={styles['popover-stat']}>
            <span className={styles['stat-label']}>Plays:</span>
            <span className={styles['stat-value']}>{track?.play_count || 0}</span>
          </div>
          <div className={styles['popover-stat']}>
            <span className={styles['stat-label']}>Likes:</span>
            <span className={styles['stat-value']}>{track?.like_count || 0}</span>
          </div>
        </div>

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
      </div>
    </div>
  );
}

