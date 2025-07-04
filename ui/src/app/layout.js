'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import './globals.css';
import { AudioProvider, useAudio } from '../lib/AudioContext';
import { NotificationProvider } from '../lib/NotificationContext';
import { UserProvider, useUser } from '../contexts/UserContext';
import { NavigationGuardProvider } from 'next-navigation-guard';
import { initGA, trackPageView, trackSearch } from '../lib/analytics';
import NotificationDropdown from '../components/NotificationDropdown';
import MoreDropdown from '../components/MoreDropdown';
import MobileWarning from '../components/MobileWarning';
import Navbar from '../components/Navbar';
import MobileNavbar from '../components/MobileNavbar';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRandom, FaRedo, FaUser, FaHome, FaMusic, 
  FaUserFriends, FaCompass, FaBookmark, FaCog, FaSun, FaMoon, FaUpload, FaSearch, FaVolumeUp, FaVolumeMute, FaInfoCircle } from 'react-icons/fa';
import api from '../lib/api';

function GlobalPlayer() {
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
  
  // Track if user is currently dragging the progress bar
  const [isDragging, setIsDragging] = useState(false);
  
  // Add router for navigation
  const router = useRouter();
  
  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Navigation functions
  const navigateToTrack = (e) => {
    e.stopPropagation();
    if (currentTrack && currentTrack.id) {
      router.push(`/track/${currentTrack.id}`);
    }
  };

  const navigateToUserProfile = (e) => {
    e.stopPropagation();
    if (currentTrack && currentTrack.username) {
      router.push(`/user/${currentTrack.username}`);
    }
  };

  // Reference to the progress bar element
  const progressBarRef = useRef(null);

  // Handle progress bar click for seeking
  const handleProgressBarClick = (e) => {
    if (!progressBarRef.current || !currentTrack) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const seekPosition = clickPosition * currentTrack.duration;
    
    // Seek to the calculated position in seconds
    seek(seekPosition);
  };

  // Handle mouse down to start dragging
  const handleMouseDown = (e) => {
    if (!progressBarRef.current || !currentTrack) return;
    
    setIsDragging(true);
    // Notify AudioContext that seeking has started
    setIsSeeking(true);
    
    // Prevent default behavior to avoid text selection while dragging
    e.preventDefault();
  };

  // Handle mouse move while dragging
  const handleMouseMove = (e) => {
    if (!isDragging || !progressBarRef.current || !currentTrack) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    
    // Update visual position only (actual seeking happens on mouse up)
    const progressBar = progressBarRef.current.querySelector('.progress');
    if (progressBar) {
      progressBar.style.width = `${position * 100}%`;
    }
  };

  // Handle mouse up to complete seeking
  const handleMouseUp = (e) => {
    if (isDragging && progressBarRef.current && currentTrack) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekPosition = position * currentTrack.duration;
      
      // Perform the actual seek
      seek(seekPosition);
    }
    
    setIsDragging(false);
  };

  // Add and remove event listeners for dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e) => handleMouseMove(e);
    const handleGlobalMouseUp = (e) => handleMouseUp(e);
    
    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, currentTrack]);

  if (!currentTrack) return null;

  return (
    <div className="global-player">
      <div className="now-playing">
        {currentTrack.profile_pic_url ? (
          <img src={currentTrack.profile_pic_url} alt="Album Art" className="now-playing-img" />
        ) : (
          <div className="now-playing-img bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
            <FaMusic className="text-gray-500 dark:text-gray-400" size={20} />
          </div>
        )}
        <div className="now-playing-info">
          <div 
            className="now-playing-title link-underline" 
            onClick={navigateToTrack}
          >
            {currentTrack.title}
          </div>
          <div 
            className="now-playing-artist link-underline"
            onClick={navigateToUserProfile}
          >
            {currentTrack.username}
          </div>
        </div>
      </div>
      
      <div className="player-controls">
        <div className="control-buttons">
          <button 
            className={`control-button ${isShuffleOn ? 'active' : ''}`}
            onClick={toggleShuffle}
            title={isShuffleOn ? "Shuffle On" : "Shuffle Off"}
          >
            <FaRandom />
          </button>
          
          <button
            className="control-button"
            onClick={playPrevious}
            title="Previous"
          >
            <FaStepBackward />
          </button>
          
          <button
            onClick={togglePlayPause}
            className="control-button play-pause"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <FaPause /> : <FaPlay />}
          </button>
          
          <button
            className="control-button"
            onClick={playNext}
            title="Next"
          >
            <FaStepForward />
          </button>
          
          <button
            className={`control-button ${isLoopOn ? 'active' : ''}`}
            onClick={toggleLoop}
            title={isLoopOn ? "Loop On" : "Loop Off"}
          >
            <FaRedo />
          </button>
        </div>
        
        <div className="progress-container">
          <div className="time">{formatTime(progress)}</div>
          <div 
            ref={progressBarRef}
            className="progress-bar"
            onClick={handleProgressBarClick}
            onMouseDown={handleMouseDown}
          >
            <div 
              className="progress"
              style={{ width: `${(progress / currentTrack.duration) * 100}%` }}
            ></div>
          </div>
          <div className="time">{formatTime(currentTrack.duration)}</div>
        </div>
      </div>
      
      <div className="volume-container">
        {/* <div className="volume-icon" onClick={toggleMute}>
          {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
        </div>
        <div 
          className="volume-slider"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            setVolumeLevel(Math.round(percent * 100));
          }}
        >
          <div 
            className="volume-level"
            style={{ width: isMuted ? '0%' : `${volumeLevel}%` }}
          ></div>
        </div> */}
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// This component will be rendered after providers are initialized
function AppContent({ children }) {
  const { user, isLoading, isAuthenticated, logout } = useUser();
  const [darkMode, setDarkMode] = useState(false);
  const { currentTrack, isPlaying, togglePlayPause } = useAudio();
  
  // Check if we're on pages where player should be hidden
  const pathname = usePathname();
  const isUploadPage = pathname === '/upload';
  const isTrackPage = pathname.startsWith('/track/');
  const shouldHidePlayer = isUploadPage || isTrackPage;
  
  const playerVisible = !!currentTrack && !shouldHidePlayer;

  // Initialize Google Analytics on mount
  useEffect(() => {
    initGA();
  }, []);

  // Track page views on route changes
  useEffect(() => {
    if (pathname) {
      trackPageView(window.location.href, document.title);
    }
  }, [pathname]);

  // Pause audio when navigating to upload or track pages
  useEffect(() => {
    if (shouldHidePlayer && isPlaying) {
      togglePlayPause();
    }
  }, [shouldHidePlayer, isPlaying, togglePlayPause]);

  // Handle keyboard shortcuts - only mount when player should be visible
  useEffect(() => {
    // Don't add keypress listeners on pages where player is hidden
    if (shouldHidePlayer) {
      return;
    }

    const handleKeyPress = (e) => {
      // Check if there's a current track and the pressed key is space
      if (currentTrack && e.code === 'Space') {
        // Check if the active element is an input, textarea, or button
        const activeElement = document.activeElement;
        const isFormElement = activeElement.tagName === 'INPUT' ||
                            activeElement.tagName === 'TEXTAREA' ||
                            activeElement.tagName === 'BUTTON' ||
                            activeElement.isContentEditable;
        
        // Only toggle play/pause if not focused on a form element
        if (!isFormElement) {
          e.preventDefault(); // Prevent space from scrolling the page
          togglePlayPause();
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyPress);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentTrack, togglePlayPause, shouldHidePlayer]);

  const allowDarkMode = false;

  // Theme setup
  useEffect(() => {
    // Check for saved theme preference or use preferred color scheme
    if (allowDarkMode) {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
        setDarkMode(true);
      }
    }
  }, []);

  const toggleTheme = (e) => {
    e.preventDefault();
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    setDarkMode(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      trackSearch(searchQuery.trim());
      router.push(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <div className={`app-container ${playerVisible ? 'player-visible' : ''}`}>
      <MobileWarning />
      
      {/* Desktop Navbar */}
      <Navbar />
      
      {/* Mobile Bottom Navbar */}
      <MobileNavbar />

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>
      
      {/* Global Player - only render when not on upload or track pages */}
      {!shouldHidePlayer && <GlobalPlayer />}
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" type="image/svg+xml" href="/next.svg" />
        <title>sterio</title>
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1172686264367392"
            crossorigin="anonymous"></script>
      </head>
      <body>
        <UserProvider>
          <AudioProvider>
            <NotificationProvider>
              <NavigationGuardProvider>
                <AppContent>
                  {children}
                </AppContent>
              </NavigationGuardProvider>
            </NotificationProvider>
          </AudioProvider>
        </UserProvider>
      </body>
    </html>
  );
}