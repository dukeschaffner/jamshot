'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaEnvelope, FaKey, FaMusic, FaMicrophone, FaProjectDiagram } from 'react-icons/fa';
import api from '../lib/api';
import styles from './LandingPage.module.css';
import LoginModal from './LoginModal';
import { getErrorMessage } from '../../shared/utils/errors';

function LandingPageContent({ onAccessGranted }) {
  const searchParams = useSearchParams();
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState(''); // 'loading', 'success', 'error', 'warning'
  const [accessStatus, setAccessStatus] = useState(''); // 'loading', 'success', 'error'
  const [waitlistMessage, setWaitlistMessage] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
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

  // Check for waitlist confirmation message
  useEffect(() => {
    const confirmed = searchParams?.get('waitlist-confirmed');
    if (confirmed === 'true') {
      setWaitlistStatus('success');
      setWaitlistMessage('Your spot on the waitlist has been confirmed! Check your email for your referral link.');
    }
  }, [searchParams]);

  // Check for error code in URL query parameters
  useEffect(() => {
    const urlErrorCode = searchParams.get('errorCode');
    if (urlErrorCode) {
      // Decode the URL-encoded error code and get displayable message
      const decodedErrorCode = decodeURIComponent(urlErrorCode);
      const displayMessage = getErrorMessage(decodedErrorCode);
      setErrorMessage(displayMessage);
    }
  }, [searchParams]);

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
      // Get referral code from URL if present
      const referralCode = searchParams?.get('ref');
      
      const payload = { email: waitlistEmail.trim() };
      if (referralCode) {
        payload.referralCode = referralCode;
      }

      const response = await api.post('/waitlist', payload);
      // Check if there's a warning message (e.g., self-referral attempt)
      if (response.data.warning) {
        setWaitlistStatus('warning');
        setWaitlistMessage(`${response.data.message} ${response.data.warning}`);
      } else {
        setWaitlistStatus('success');
        setWaitlistMessage('Thanks! Check your email to confirm your spot on the waitlist and get your referral link.');
      }
      setWaitlistEmail('');
    } catch (error) {
      setWaitlistStatus('error');
      if (error.response?.status === 409) {
        setWaitlistMessage('This email is already on our waitlist!');
      } else {
        setWaitlistMessage('Something went wrong. Please try again.');
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
        setAccessMessage('Access granted! Welcome to Sterio!');
        // Store access in session/localStorage
        sessionStorage.setItem('sterio_access_granted', 'true');
        // Call parent function to hide landing page
        setTimeout(() => onAccessGranted(), 1500);
      } else {
        setAccessStatus('error');
        setAccessMessage('Invalid access code. Please check and try again.');
      }
    } catch (error) {
      setAccessStatus('error');
      setAccessMessage('Something went wrong. Please try again.');
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
              The social platform where posts and comments are music-based, not text-based
            </p>
          </div>

          <div className={styles.description}>
            {/* <h2>Music Collaboration Reimagined</h2>
            <p>
              Sterio is revolutionizing how musicians collaborate. Upload your tracks, 
              layer sounds from other artists, and create amazing music together. 
              It&apos;s like social media, but for music creation.
            </p> */}
            
            <div className={styles.features}>
              <div className={styles.featureItem}>
                <FaMusic className={styles.featureIcon} />
                <div>
                  <h3>Browse Feed and Post Daily</h3>
                  <p>Sterio incentivizes and facilitates daily content creation. Check back daily to see what your friends and favorite artists are working on.</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <FaMicrophone className={styles.featureIcon} />
                <div>
                  <h3>Inspired by a Track? Add Your Own Collab in Seconds</h3>
                  <p>Click &apos;Collab&apos; on a track to open the simple built in DAW to add your own layer to the track. Your version will appear under the original track and on your page.</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <FaProjectDiagram className={styles.featureIcon} />
                <div>
                  <h3>Explore Track Version Trees</h3>
                  <p>Every collaboration creates a new version, building a tree of different track versions you can explore. Navigate through the evolution of tracks and discover how artists build on each other&apos;s work.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message Display */}
          {errorMessage && (
            <div className={`${styles.statusMessage} ${styles.error}`}>
              {errorMessage}
            </div>
          )}

          {/* Forms Section */}
          <div className={styles.forms}>
            {/* Waitlist Form */}
            <div className={styles.formContainer}>
              <h3>Join the Waitlist</h3>
              <ul>
                <li>Be the first to know when we launch publicly</li>
                <li>Refer 3 friends to get priority early access and get your tracks on the feed at launch</li>
              </ul>
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
              {waitlistMessage && (
                <div className={`${styles.statusMessage} ${styles[waitlistStatus]}`}>
                  {waitlistMessage}
                </div>
              )}
            </div>

            {/* Access Code Form */}
            <div className={styles.formContainer}>
              <h3>Already have early access?</h3>
              <p>Enter your access code or sign in to get started!</p>
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
              <div className={styles.divider}>
                <span>or</span>
              </div>
              <button 
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className={`${styles.btn} ${styles.btnSecondary} w-full`}
              >
                Sign In
              </button>
              {accessMessage && (
                <div className={`${styles.statusMessage} ${styles[accessStatus]}`}>
                  {accessMessage}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
      <LoginModal 
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => {
          // Grant access on successful login
          sessionStorage.setItem('sterio_access_granted', 'true');
          setTimeout(() => onAccessGranted(), 500);
        }}
      />
    </div>
  );
}

export default function LandingPage({ onAccessGranted }) {
  return (
    <Suspense fallback={
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        background: 'var(--background)',
        color: 'var(--text-primary)'
      }}>
        <div>Loading...</div>
      </div>
    }>
      <LandingPageContent onAccessGranted={onAccessGranted} />
    </Suspense>
  );
}
