'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import './globals.css';
import { AudioProvider, useAudio } from '../lib/AudioContext';
import { NotificationProvider } from '../lib/NotificationContext';
import NotificationDropdown from '../components/NotificationDropdown';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRandom, FaRedo, FaUser } from 'react-icons/fa';

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

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white p-4 flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <button
          onClick={playPrevious}
          className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600"
          title="Previous"
        >
          <FaStepBackward />
        </button>
        
        <button
          onClick={togglePlayPause}
          className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <FaPause /> : <FaPlay />}
        </button>
        
        <button
          onClick={playNext}
          className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600"
          title="Next"
        >
          <FaStepForward />
        </button>
        
        <button
          onClick={toggleShuffle}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isShuffleOn ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={isShuffleOn ? "Shuffle On" : "Shuffle Off"}
        >
          <FaRandom />
        </button>
        
        <button
          onClick={toggleLoop}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isLoopOn ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={isLoopOn ? "Loop On" : "Loop Off"}
        >
          <FaRedo />
        </button>
      </div>
      
      <div className="flex-1 mx-4">
        <div className="flex justify-between items-center mb-1">
          <div className="text-sm truncate max-w-xs">
            <span className="font-medium">{currentTrack.title}</span>
            {currentTrack.username && (
              <span className="text-gray-400"> - {currentTrack.username}</span>
            )}
          </div>
          <div className="text-xs text-gray-400">
            {formatTime(progress)} / {formatTime(currentTrack.duration)}
          </div>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500"
            style={{ width: `${(progress / currentTrack.duration) * 100}%` }}
            onClick={(e) => {
              const rect = e.currentTarget.parentElement.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              seek(percent * currentTrack.duration);
            }}
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

export default function RootLayout({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
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
  }, []);

  const handleLogout = () => {
    Cookies.remove('token');
    setIsLoggedIn(false);
    setUserId(null);
  };

  return (
    <html lang="en">
      <body className="bg-gray-100">
        <AudioProvider>
          <NotificationProvider>
            <nav className="bg-blue-600 p-4 text-white">
              <div className="max-w-4xl mx-auto flex justify-between items-center">
                <Link href="/" className="text-xl font-bold">JamShot</Link>
                <div className="flex items-center space-x-4">
                  {isLoggedIn ? (
                    <>
                      <Link href="/upload" className="hover:text-blue-200">Upload</Link>
                      <NotificationDropdown />
                      {userId && (
                        <Link 
                          href={`/user/${userId}`} 
                          className="hover:text-blue-200"
                          title="My Profile"
                        >
                          <FaUser />
                        </Link>
                      )}
                      <button 
                        onClick={handleLogout} 
                        className="bg-red-500 px-3 py-1 rounded hover:bg-red-600"
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" className="hover:text-blue-200">Login</Link>
                      <Link 
                        href="/register" 
                        className="bg-green-500 px-3 py-1 rounded hover:bg-green-600"
                      >
                        Register
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </nav>
            <main className="max-w-4xl mx-auto p-4 pb-16">{children}</main> {/* Padding for player */}
            <GlobalPlayer />
          </NotificationProvider>
        </AudioProvider>
      </body>
    </html>
  );
}