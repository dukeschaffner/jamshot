'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useLoopListening } from '../utils/LoopListeningContext';
import { eventBus } from '@/components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '@/components/DAW/misc/DAWEvents.js';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRedo, FaMusic, 
  FaCheckCircle } from 'react-icons/fa';
import styles from './LoopListeningPlayer.module.css';
import { useMobile } from '@/contexts/MobileContext';
import { useTreeInteractions } from '../utils/TreeInteractionsContext';
import PlayingIndicator from '@/components/PlayingIndicator';
import BetaSupporterBadge from '@/components/BetaSupporterBadge';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function LoopListeningPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    loopDuration,
    togglePlayPause, 
    seek, 
    playNext, 
    playPrevious,
    isCycleMode,
    toggleCycle
  } = useLoopListening();

  const { navigateToPlayingTrack } = useTreeInteractions();
  
  const { isMobile } = useMobile();

  // Local progress state managed by this component
  const [progress, setProgress] = useState(0);
  
  // Track if user is currently interacting with the progress bar via mouse.
  // We distinguish click-to-seek (handled by onClick) from drag-to-scrub (handled on mouseup)
  // to avoid double-seeking on a plain click.
  const [isMouseDown, setIsMouseDown] = useState(false);
  const dragStartedRef = useRef(false);
  const mouseDownXRef = useRef(0);
  const suppressNextClickRef = useRef(false);
  
  // Mobile modal state
  const [showMobileModal, setShowMobileModal] = useState(false);
  
  // Portal container for app-container
  const [portalContainer, setPortalContainer] = useState(null);
  
  // Add router for navigation
  const router = useRouter();
  
  // Find app-container element for portal and manage visibility class
  useEffect(() => {
    const findAppContainer = () => {
      const container = document.querySelector('.app-container');
      if (container) {
        setPortalContainer(container);
      }
    };
    
    // Try to find immediately
    findAppContainer();
    
    // If not found, wait for DOM to be ready
    if (!portalContainer) {
      const interval = setInterval(() => {
        findAppContainer();
        if (portalContainer) {
          clearInterval(interval);
        }
      }, 100);
      
      // Also try on next frame
      requestAnimationFrame(findAppContainer);
      
      return () => clearInterval(interval);
    }
  }, [portalContainer]);
  
  // Add/remove visibility class on app-container
  useEffect(() => {
    const container = portalContainer || document.querySelector('.app-container');
    if (!container) return;
    
    if (currentTrack) {
      container.classList.add('player-visible');
    } else {
      container.classList.remove('player-visible');
    }
    
    return () => {
      container.classList.remove('player-visible');
    };
  }, [currentTrack, portalContainer]);
  
  // Handle now playing click for mobile
  const handleNowPlayingClick = (e) => {
    e.stopPropagation();
    if (isMobile) {
      setShowMobileModal(true);
    }
  };
  
  // Close mobile modal
  const closeMobileModal = () => {
    setShowMobileModal(false);
  };
  
  // Reference to the progress bar element
  const progressBarRef = useRef(null);
  
  // Handle progress bar click for seeking
  const handleProgressBarClick = (e) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!progressBarRef.current || !currentTrack || !loopDuration) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const seekPosition = clickPosition * loopDuration;
    
    // Seek to the calculated position in seconds
    seek(seekPosition);
  };
  
  // Handle mouse down to start dragging
  const handleMouseDown = (e) => {
    if (!progressBarRef.current || !currentTrack || !loopDuration) return;
    
    setIsMouseDown(true);
    dragStartedRef.current = false;
    mouseDownXRef.current = e.clientX;
    
    // Prevent default behavior to avoid text selection while dragging
    e.preventDefault();
  };
  
  // Handle mouse move while dragging
  const handleMouseMove = (e) => {
    if (!isMouseDown || !progressBarRef.current || !currentTrack || !loopDuration) return;

    // Only treat as a drag after the cursor moves a little bit.
    if (!dragStartedRef.current && Math.abs(e.clientX - mouseDownXRef.current) > 3) {
      dragStartedRef.current = true;
    }
    if (!dragStartedRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    
    // Update visual position only (actual seeking happens on mouse up)
    const progressBar = progressBarRef.current.querySelector(`.${styles.progress}`);
    if (progressBar) {
      progressBar.style.width = `${position * 100}%`;
    }
  };
  
  // Handle mouse up to complete seeking
  const handleMouseUp = (e) => {
    if (dragStartedRef.current && progressBarRef.current && currentTrack && loopDuration) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekPosition = position * loopDuration;
      
      // Perform the actual seek
      seek(seekPosition);
      // The browser will still fire a click after mouseup; skip it since we already sought.
      suppressNextClickRef.current = true;
    }
    
    setIsMouseDown(false);
    dragStartedRef.current = false;
  };
  
  // Add and remove event listeners for dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e) => handleMouseMove(e);
    const handleGlobalMouseUp = (e) => handleMouseUp(e);
    
    if (isMouseDown) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isMouseDown, currentTrack, loopDuration]);

  // Listen for progress and seek events to manage local progress state
  useEffect(() => {
    const handleProgressUpdate = (data) => {
      setProgress(data.progress);
    };

    const handleSeek = (data) => {
      setProgress(data.position);
    };

    // Register event listeners
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PROGRESS_UPDATE, handleProgressUpdate);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.SEEK, handleSeek);

    // Cleanup: remove event listeners
    return () => {
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PROGRESS_UPDATE, handleProgressUpdate);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.SEEK, handleSeek);
    };
  }, []);
  
  // Navigation functions
  const navigateToTrack = (e) => {
    e.stopPropagation();
    if (currentTrack && currentTrack.guid) {
      router.push(`/track/${currentTrack.guid}`);
    }
  };
  
  const navigateToUserProfile = (e) => {
    e.stopPropagation();
    if (currentTrack && currentTrack.username) {
      router.push(`/user/${currentTrack.username}`);
    }
  };
  
  if (!currentTrack) return null;
  
  const playerContent = (
    <div className={styles.loopPlayer}>
        <div 
          className={styles.nowPlaying}
          onClick={handleNowPlayingClick}
          style={{ cursor: isMobile ? 'pointer' : 'default' }}
        >
          {currentTrack.profile_pic_url ? (
            <img src={currentTrack.profile_pic_url} alt="Album Art" className={styles.nowPlayingImg} />
          ) : (
            <div className={`${styles.nowPlayingImg} bg-gray-300 dark:bg-gray-700 flex items-center justify-center`}>
              <FaMusic className="text-gray-500 dark:text-gray-400" size={20} />
            </div>
          )}
          <div className={styles.nowPlayingInfo}>
            <div 
              className={`${styles.nowPlayingTitle} link-underline`}
              onClick={navigateToTrack}
            >
              {currentTrack.title}
            </div>
            <div 
              className={`${styles.nowPlayingArtist} link-underline`}
              onClick={navigateToUserProfile}
            >
              <span className="link-underline" onClick={navigateToUserProfile}>
                {currentTrack.username}
              </span>
              {currentTrack.verified && <FaCheckCircle className="verified-icon" />}
              {(currentTrack.is_supporter || currentTrack.isSupporter) && <BetaSupporterBadge variant="icon" />}
            </div>
          </div>
        </div>
        
        <div className={styles.controlButtons}>
            {!isMobile && (
              <button
                className={styles.controlButton}
                onClick={playPrevious}
                title="Previous"
              >
                <FaStepBackward />
              </button>
            )}
            
            <button
              onClick={togglePlayPause}
              className={`${styles.controlButton} ${styles.playPause}`}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <FaPause /> : <FaPlay />}
            </button>
            
            {!isMobile && (
              <button
                className={styles.controlButton}
                onClick={playNext}
                title="Next"
              >
                <FaStepForward />
              </button>
            )}
            
            {!isMobile && (
              <button
                className={`${styles.controlButton} ${styles.repeatButton} ${isCycleMode ? styles.active : ''}`}
                onClick={toggleCycle}
                title={isCycleMode ? "Cycle On" : "Cycle Off"}
              >
                <FaRedo />
              </button>
            )}
          </div>

          <div className={styles.progressContainer}>
            <div className={styles.time}>{formatTime(progress)}</div>
            <div 
              ref={progressBarRef}
              className={styles.progressBar}
              onClick={handleProgressBarClick}
              onMouseDown={handleMouseDown}
            >
              <div 
                className={styles.progress}
                style={{ width: `${loopDuration ? (progress / loopDuration) * 100 : 0}%` }}
              ></div>
            </div>
            <div className={styles.time}>{formatTime(loopDuration || 0)}</div>
          </div>
        
        <div className={styles.volumeContainer}>
          <div className="pill-btn sm" onClick={navigateToPlayingTrack}>
            Show Track
            {isPlaying && (
              <div style={{ marginLeft: '8px' }}>
                <PlayingIndicator size={20} />
              </div>
            )}
          </div>
        </div>
      </div>
  );
  
  // Render player via portal into app-container, or directly if portal not available
  return (
    <>
      {portalContainer ? createPortal(playerContent, portalContainer) : playerContent}

      {/* Mobile Fullscreen Player Modal */}
      {isMobile && (
        <div 
          className={`mobile-modal ${showMobileModal ? 'active' : ''}`}
          onClick={closeMobileModal}
        >
          <button className="mobile-modal-close-button" onClick={closeMobileModal}>
            <FaCheckCircle />
          </button>
          <div className="mobile-modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Album Art */}
            {currentTrack.profile_pic_url ? (
              <img 
                src={currentTrack.profile_pic_url} 
                alt="Album Art" 
                className={styles.mobilePlayerImage} 
              />
            ) : (
              <div className={styles.mobilePlayerImagePlaceholder}>
                <FaMusic />
              </div>
            )}

            {/* Track Info */}
            <div className={styles.mobilePlayerTrackInfo}>
              <div 
                className={`${styles.mobilePlayerTrackTitle} link-underline`}
                onClick={navigateToTrack}
              >
                {currentTrack.title}
              </div>
              <div 
                className={`${styles.mobilePlayerTrackArtist} link-underline`}
                onClick={navigateToUserProfile}
              >
                <span className="link-underline" onClick={navigateToUserProfile}>
                  {currentTrack.username}
                </span>
                {currentTrack.verified && <FaCheckCircle className="verified-icon" />}
                {(currentTrack.is_supporter || currentTrack.isSupporter) && <BetaSupporterBadge variant="icon" />}
              </div>
            </div>

            {/* Progress Section */}
            <div className={styles.mobilePlayerProgressSection}>
              <div 
                ref={progressBarRef}
                className={`${styles.progressBar} ${styles.mobilePlayerProgressBar}`}
                onClick={handleProgressBarClick}
                onMouseDown={handleMouseDown}
              >
                <div 
                  className={styles.progress}
                  style={{ width: `${loopDuration ? (progress / loopDuration) * 100 : 0}%` }}
                ></div>
              </div>
              <div className={styles.mobilePlayerTimeDisplay}>
                <span className={styles.time}>{formatTime(progress)}</span>
                <span className={styles.time}>{formatTime(loopDuration || 0)}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className={styles.mobilePlayerControls}>
              <button
                className={`${styles.controlButton} ${styles.mobileControlButton}`}
                onClick={playPrevious}
                title="Previous"
              >
                <FaStepBackward />
              </button>
              
              <button
                onClick={togglePlayPause}
                className={`${styles.controlButton} ${styles.playPause} ${styles.mobilePlayButton}`}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              
              <button
                className={`${styles.controlButton} ${styles.mobileControlButton}`}
                onClick={playNext}
                title="Next"
              >
                <FaStepForward />
              </button>
              
              <button
                className={`${styles.controlButton} ${styles.repeatButton} ${isCycleMode ? styles.active : ''} ${styles.mobileControlButton}`}
                onClick={toggleCycle}
                title={isCycleMode ? "Cycle On" : "Cycle Off"}
              >
                <FaRedo />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

