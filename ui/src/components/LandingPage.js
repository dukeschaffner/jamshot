'use client';

import { useState, useRef, useEffect } from 'react';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaEnvelope, FaKey, FaMusic } from 'react-icons/fa';
import api from '../lib/api';
import styles from './LandingPage.module.css';

export default function LandingPage({ onAccessGranted }) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState(''); // 'loading', 'success', 'error'
  const [accessStatus, setAccessStatus] = useState(''); // 'loading', 'success', 'error'
  const [statusMessage, setStatusMessage] = useState('');
  const videoRef = useRef(null);

  // Auto-play video on mount (muted)
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        setIsVideoPlaying(true);
      }).catch((error) => {
        console.log('Auto-play failed:', error);
      });
    }
  }, []);

  const toggleVideoPlayback = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        videoRef.current.play();
        setIsVideoPlaying(true);
      }
    }
  };

  const toggleVideoMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isVideoMuted;
      setIsVideoMuted(!isVideoMuted);
    }
  };

  const handleWaitlistSubmit = async (e) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;

    setWaitlistStatus('loading');
    try {
      await api.post('/waitlist', { email: waitlistEmail.trim() });
      setWaitlistStatus('success');
      setStatusMessage('Thanks! You\'ve been added to our waitlist. We\'ll notify you when we launch!');
      setWaitlistEmail('');
    } catch (error) {
      setWaitlistStatus('error');
      if (error.response?.status === 409) {
        setStatusMessage('This email is already on our waitlist!');
      } else {
        setStatusMessage('Something went wrong. Please try again.');
      }
    }
  };

  const handleAccessCodeSubmit = async (e) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setAccessStatus('loading');
    try {
      const response = await api.post('/access-code/verify', { code: accessCode.trim() });
      if (response.data.valid) {
        setAccessStatus('success');
        setStatusMessage('Access granted! Welcome to Sterio!');
        // Store access in session/localStorage
        sessionStorage.setItem('sterio_access_granted', 'true');
        // Call parent function to hide landing page
        setTimeout(() => onAccessGranted(), 1500);
      } else {
        setAccessStatus('error');
        setStatusMessage('Invalid access code. Please check and try again.');
      }
    } catch (error) {
      setAccessStatus('error');
      setStatusMessage('Something went wrong. Please try again.');
    }
  };

  return (
    <div className={styles.landingPage}>
      <div className={styles.landingContent}>
        {/* Video Section */}
        <div className={styles.videoSection}>
          <div className={styles.videoContainer}>
            <video
              ref={videoRef}
              className={styles.video}
              muted={isVideoMuted}
              loop
              playsInline
              preload="metadata"
            >
              <source 
                src={`${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://cdn.sterio.fm'}/videos/static/sterio-intro.mov`} 
                type="video/mp4" 
              />
              Your browser does not support the video tag.
            </video>
            
            {/* Video Controls */}
            <div className={styles.videoControls}>
              <button 
                className={styles.videoControlBtn} 
                onClick={toggleVideoPlayback}
                aria-label={isVideoPlaying ? 'Pause video' : 'Play video'}
              >
                {isVideoPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <button 
                className={styles.videoControlBtn} 
                onClick={toggleVideoMute}
                aria-label={isVideoMuted ? 'Unmute video' : 'Mute video'}
              >
                {isVideoMuted ? <FaVolumeMute /> : <FaVolumeUp />}
              </button>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className={styles.infoSectionContainer}>
          <div className={styles.infoSection}>
          <div className={styles.header}>
            <div className={styles.logo}>
              {/* <FaMusic className={styles.logoIcon} /> */}
              <h1 className={styles.title}>sterio</h1>
            </div>
            <p className={styles.subtitle}>
              The social platform where musicians collaborate and create together
            </p>
          </div>

          <div className={styles.description}>
            <h2>Music Collaboration Reimagined</h2>
            <p>
              Sterio is revolutionizing how musicians collaborate. Upload your tracks, 
              layer sounds from other artists, and create amazing music together. 
              It's like social media, but for music creation.
            </p>
            
            <div className={styles.features}>
              <div className={styles.featureItem}>
                <FaMusic className={styles.featureIcon} />
                <div>
                  <h3>Create & Collaborate</h3>
                  <p>Upload your music or add layers to existing tracks</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <FaPlay className={styles.featureIcon} />
                <div>
                  <h3>Built-in DAW</h3>
                  <p>Record and edit directly in your browser</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <FaEnvelope className={styles.featureIcon} />
                <div>
                  <h3>Social Features</h3>
                  <p>Follow artists, like tracks, and discover new music</p>
                </div>
              </div>
            </div>
          </div>

          {/* Forms Section */}
          <div className={styles.forms}>
            {/* Waitlist Form */}
            <div className={styles.formContainer}>
              <h3>Join the Waitlist</h3>
              <p>Be the first to know when we launch publicly!</p>
              <form onSubmit={handleWaitlistSubmit} className={styles.form}>
                <div className={styles.inputGroup}>
                  <FaEnvelope className={styles.formIcon} />
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    disabled={waitlistStatus === 'loading'}
                  />
                </div>
                <button 
                  type="submit" 
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={waitlistStatus === 'loading'}
                >
                  {waitlistStatus === 'loading' ? 'Adding...' : 'Join Waitlist'}
                </button>
              </form>
            </div>

            {/* Access Code Form */}
            <div className={styles.formContainer}>
              <h3>Have an Early Access Code?</h3>
              <p>Enter your code to get immediate access!</p>
              <form onSubmit={handleAccessCodeSubmit} className={styles.form}>
                <div className={styles.inputGroup}>
                  <FaKey className={styles.formIcon} />
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                    placeholder="Enter access code"
                    required
                    disabled={accessStatus === 'loading'}
                  />
                </div>
                <button 
                  type="submit" 
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  disabled={accessStatus === 'loading'}
                >
                  {accessStatus === 'loading' ? 'Verifying...' : 'Get Access'}
                </button>
              </form>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className={`${styles.statusMessage} ${styles[waitlistStatus || accessStatus]}`}>
              {statusMessage}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
