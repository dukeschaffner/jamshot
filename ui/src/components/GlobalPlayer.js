'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAudio } from '../lib/AudioContext';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRandom, FaRedo, FaMusic, 
  FaVolumeUp, FaVolumeMute, FaChevronDown, FaCheckCircle } from 'react-icons/fa';
import styles from './GlobalPlayer.module.css';
import { useMobile } from '../contexts/MobileContext';
import BetaSupporterBadge from './BetaSupporterBadge';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function GlobalPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    progress, 
    togglePlayPause, 
    seek, 
    setIsSeeking,
    playNext, 
    playPrevious,
    isShuffleOn,
    isLoopOn,
    toggleShuffle,
    toggleLoop
  } = useAudio();
  
  // Volume UI state (non-functional)
  const [volumeLevel, setVolumeLevel] = useState(70);
  const [isMuted, setIsMuted] = useState(false);

  const { isMobile } = useMobile();
  
  // Track if user is currently dragging the progress bar
  const [isDragging, setIsDragging] = useState(false);
  
  // Mobile modal state
  const [showMobileModal, setShowMobileModal] = useState(false);
  
  // Add router for navigation
  const router = useRouter();
  
  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

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
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  // Handle progress bar click for seeking
  const handleProgressBarClick = (e) => {
    const track = currentTrackRef.current;
    if (!progressBarRef.current || !track) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const seekPosition = clickPosition * track.duration;

    seek(seekPosition);
    setIsDragging(false);
  };

  // Handle mouse down to start dragging
  const handleMouseDown = (e) => {
    if (!progressBarRef.current || !currentTrackRef.current) return;
    
    setIsDragging(true);
    // Notify AudioContext that seeking has started
    setIsSeeking(true);
    
    // Prevent default behavior to avoid text selection while dragging
    e.preventDefault();
  };

  // Handle mouse move while dragging
  const handleMouseMove = (e) => {
    const track = currentTrackRef.current;
    if (!isDragging || !progressBarRef.current || !track) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    const progressBar = progressBarRef.current.querySelector(`.${styles.progress}`);
    if (progressBar) {
      progressBar.style.width = `${position * 100}%`;
    }
  };

  // Handle mouse up to complete seeking
  const handleMouseUp = (e) => {
    const track = currentTrackRef.current;
    if (isDragging && progressBarRef.current && track) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekPosition = position * track.duration;
      seek(seekPosition);
    }

    setIsDragging(false);
  };

  // Capture phase: DAW (and other code) may stopPropagation on bubble; window bubble listeners never run.
  useEffect(() => {
    const handleGlobalMouseMove = (e) => handleMouseMove(e);
    const handleGlobalMouseUp = (e) => handleMouseUp(e);

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove, true);
      window.addEventListener('mouseup', handleGlobalMouseUp, true);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove, true);
      window.removeEventListener('mouseup', handleGlobalMouseUp, true);
    };
  }, [isDragging]);

  if (!currentTrack) return null;

  return (
    <>
      <div className={styles.globalPlayer}>
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
                className={`${styles.controlButton} ${isShuffleOn ? styles.active : ''}`}
                onClick={toggleShuffle}
                title={isShuffleOn ? "Shuffle On" : "Shuffle Off"}
              >
                <FaRandom />
              </button>
            )}
            
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
                className={`${styles.controlButton} ${styles.repeatButton} ${isLoopOn ? styles.active : ''}`}
                onClick={toggleLoop}
                title={isLoopOn ? "Loop On" : "Loop Off"}
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
                style={{ width: `${(progress / currentTrack.duration) * 100}%` }}
              ></div>
            </div>
            <div className={styles.time}>{formatTime(currentTrack.duration)}</div>
          </div>
        
        <div className={styles.volumeContainer}>
          {/* <div className={styles.volumeIcon} onClick={toggleMute}>
            {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
          </div>
          <div 
            className={styles.volumeSlider}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              setVolumeLevel(Math.round(percent * 100));
            }}
          >
            <div 
              className={styles.volumeLevel}
              style={{ width: isMuted ? '0%' : `${volumeLevel}%` }}
            ></div>
          </div> */}
        </div>
      </div>

      {/* Mobile Fullscreen Player Modal */}
      {isMobile && (
        <div 
          className={`mobile-modal ${showMobileModal ? 'active' : ''}`}
          onClick={closeMobileModal}
        >
          <button className="mobile-modal-close-button" onClick={closeMobileModal}>
            <FaChevronDown />
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
                  style={{ width: `${(progress / currentTrack.duration) * 100}%` }}
                ></div>
              </div>
              <div className={styles.mobilePlayerTimeDisplay}>
                <span className={styles.time}>{formatTime(progress)}</span>
                <span className={styles.time}>{formatTime(currentTrack.duration)}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className={styles.mobilePlayerControls}>
              <button 
                className={`${styles.controlButton} ${isShuffleOn ? styles.active : ''} ${styles.mobileControlButton}`}
                onClick={toggleShuffle}
                title={isShuffleOn ? "Shuffle On" : "Shuffle Off"}
              >
                <FaRandom />
              </button>
              
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
                className={`${styles.controlButton} ${styles.repeatButton} ${isLoopOn ? styles.active : ''} ${styles.mobileControlButton}`}
                onClick={toggleLoop}
                title={isLoopOn ? "Loop On" : "Loop Off"}
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