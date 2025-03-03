'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import './globals.css';
import { AudioProvider, useAudio } from '../lib/AudioContext';
import { NotificationProvider } from '../lib/NotificationContext';
import NotificationDropdown from '../components/NotificationDropdown';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRandom, FaRedo, FaUser, FaHome, FaMusic, 
  FaUserFriends, FaCompass, FaBookmark, FaCog, FaSun, FaMoon, FaUpload, FaSearch, FaVolumeUp, FaVolumeMute, FaInfoCircle } from 'react-icons/fa';

function GlobalPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    progress, 
    togglePlayPause, 
    seek, 
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
  
  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (!currentTrack) return null;

  return (
    <div className="global-player">
      <div className="now-playing">
        {currentTrack.coverUrl ? (
          <img src={currentTrack.coverUrl} alt="Album Art" className="now-playing-img" />
        ) : (
          <div className="now-playing-img bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
            <FaMusic className="text-gray-500 dark:text-gray-400" size={20} />
          </div>
        )}
        <div className="now-playing-info">
          <div className="now-playing-title">{currentTrack.title}</div>
          <div className="now-playing-artist">{currentTrack.username}</div>
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
            className="progress-bar"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              seek(percent * currentTrack.duration);
            }}
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
        <div className="volume-icon" onClick={toggleMute}>
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
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// This component will be rendered after AudioProvider is initialized
function AppContent({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [activeLink, setActiveLink] = useState('/');
  const searchInputRef = useRef(null);
  const { currentTrack } = useAudio();
  const playerVisible = !!currentTrack;

  useEffect(() => {
    // Check for saved theme preference or use preferred color scheme
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.body.classList.add('dark-mode');
      setDarkMode(true);
    }
    
    const token = Cookies.get('token');
    setIsLoggedIn(!!token);
    
    // Get user ID from token if available
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserId(payload.id);
      } catch (e) {
        console.error('Failed to parse token:', e);
      }
    }
    
    // Set active link based on current path
    const path = window.location.pathname;
    setActiveLink(path);
  }, []);

  const toggleTheme = (e) => {
    e.preventDefault();
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    setDarkMode(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const handleLogout = () => {
    Cookies.remove('token');
    setIsLoggedIn(false);
    setUserId(null);
  };

  return (
    <div className={`app-container ${playerVisible ? 'player-visible' : ''}`}>
      {/* Vertical Navbar */}
      <nav className="navbar">
        <div className="logo">
          <Link href="/">
            <span>JamShot</span>
          </Link>
        </div>
        
        <div className="search-box">
          <FaSearch className="search-icon" />
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search for artists, tracks..." 
          />
        </div>
        
        <div className="nav-links">
          <Link href="/" className={`nav-link ${activeLink === '/' ? 'active' : ''}`}>
            <FaHome />
            Home
          </Link>
          <Link href="/about" className={`nav-link ${activeLink === '/about' ? 'active' : ''}`}>
            <FaInfoCircle />
            About
          </Link>
          {/* <Link href="/library" className={`nav-link ${activeLink === '/library' ? 'active' : ''}`}>
            <FaMusic />
            Library
          </Link>
          <Link href="/artists" className={`nav-link ${activeLink === '/artists' ? 'active' : ''}`}>
            <FaUserFriends />
            Artists
          </Link>
          <Link href="/discover" className={`nav-link ${activeLink === '/discover' ? 'active' : ''}`}>
            <FaCompass />
            Discover
          </Link>
          <Link href="/saved" className={`nav-link ${activeLink === '/saved' ? 'active' : ''}`}>
            <FaBookmark />
            Saved
          </Link>
          <Link href="/settings" className={`nav-link ${activeLink === '/settings' ? 'active' : ''}`}>
            <FaCog />
            Settings
          </Link> */}
          
          <a href="#" className="nav-link theme-toggle" onClick={toggleTheme}>
            {darkMode ? <FaMoon /> : <FaSun />}
            <span>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
          </a>
        </div>
        
        {isLoggedIn ? (
          <>
            <Link href="/upload" className="upload-btn">
              <FaUpload />
              Upload Track
            </Link>
            
            <div className="user-profile">
              <div className="user-avatar">
                <img src="/api/placeholder/80/80" alt="User Avatar" />
              </div>
              <div className="user-info">
                <div className="user-name">User</div>
                <div className="user-handle">@user</div>
              </div>
              <button 
                onClick={handleLogout} 
                className="ml-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Logout"
              >
                Logout
              </button>
            </div>
          </>
        ) : (
          <div className="auth-buttons">
            <Link href="/login" className="login-btn">
              Login
            </Link>
            <Link href="/register" className="register-btn">
              Register
            </Link>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>
      
      {/* Global Player */}
      <GlobalPlayer />
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AudioProvider>
          <NotificationProvider>
            <AppContent>
              {children}
            </AppContent>
          </NotificationProvider>
        </AudioProvider>
      </body>
    </html>
  );
}