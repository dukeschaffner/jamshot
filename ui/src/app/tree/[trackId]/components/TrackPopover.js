'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FaCheckCircle, FaCheck, FaPlay, FaPause, FaEllipsisV } from 'react-icons/fa';
import { usePluginWebSocket } from '../../../../contexts/PluginWebSocketContext';
import { useLoopListening } from '../utils/LoopListeningContext';
import TrackTags from '../../../../components/TrackTags';
import TrackMeta from '../../../../components/TrackMeta';
import TimeDisplay from '../../../../components/TimeDisplay';
import BetaSupporterBadge from '../../../../components/BetaSupporterBadge';
import styles from './TrackPopover.module.css';

export default function TrackPopover({ track, position, onClose, onMouseEnter, isLoopMode = false, onTrackLikeUpdate, onTrackRepostUpdate }) {
  const router = useRouter();
  
  // Use loop listening if available and requested, otherwise use regular audio
  const audioContext = useLoopListening();
  const { currentTrack, isPlaying, playTrack, togglePlayPause, queueTrack } = audioContext;
  const { send } = usePluginWebSocket();
  
  const popoverRef = useRef(null);
  const actionsMenuRef = useRef(null);
  const queueFeedbackTimeoutRef = useRef(null);
  const [showQueuedFeedback, setShowQueuedFeedback] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

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
      if (queueFeedbackTimeoutRef.current) clearTimeout(queueFeedbackTimeoutRef.current);
      setShowQueuedFeedback(true);
      queueFeedbackTimeoutRef.current = setTimeout(() => {
        setShowQueuedFeedback(false);
        queueFeedbackTimeoutRef.current = null;
      }, 1000);
    }
  };

  useEffect(() => {
    return () => {
      if (queueFeedbackTimeoutRef.current) clearTimeout(queueFeedbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
        setShowActionsMenu(false);
      }
    }
    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActionsMenu]);

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

  const handleOpenInPlugin = async (e) => {
    e.stopPropagation();
    const msg = {
      type: 'set_track',
      track_id: track.id,
      payload: track,
    };
    try {
      await send(JSON.stringify(msg));
    } catch (err) {
    }
    setShowActionsMenu(false);
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
              {(track?.is_supporter || track?.isSupporter) && <BetaSupporterBadge variant="icon" />}
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

        {track?.created_at && (
          <div className={styles['popover-timestamp']}>
            <TimeDisplay timestamp={track.created_at} />
          </div>
        )}

        <div className={styles['popover-meta']}>
          <TrackMeta track={track} variant="mini" onTrackLikeUpdate={onTrackLikeUpdate} onTrackRepostUpdate={onTrackRepostUpdate} />
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
              {showQueuedFeedback ? (
                <>
                  <span className={styles['popover-queue-icon']} aria-hidden><FaCheck /></span>
                  Queued
                </>
              ) : (
                'Queue'
              )}
            </button>
          )}
          <div className={styles['popover-actions-menu']} ref={actionsMenuRef}>
            <button
              type="button"
              className={styles['popover-more-button']}
              title="More actions"
              aria-expanded={showActionsMenu}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setShowActionsMenu((open) => !open);
              }}
            >
              <FaEllipsisV aria-hidden />
            </button>
            {showActionsMenu && (
              <div className={styles['popover-actions-dropdown']} role="menu">
                <button
                  type="button"
                  className={styles['popover-action-item']}
                  role="menuitem"
                  onClick={handleOpenInPlugin}
                >
                  Open in Plugin
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={styles['popover-tags']}>
          <TrackTags track={track} variant="light" />
        </div>
      </div>
    </div>
  );
}

