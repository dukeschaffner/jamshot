'use client';
import { useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import './globals.css';
import { AudioProvider, useAudio } from '../lib/AudioContext';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRandom, FaRedo } from 'react-icons/fa';

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
      </div>
      
      <div className="flex-1">
        <p className="text-sm font-medium">{currentTrack.title}</p>
        {currentTrack.username && (
          <p className="text-xs text-gray-400">by {currentTrack.username}</p>
        )}
      </div>
      
      <div className="flex items-center space-x-4 w-1/2">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(e) => seek(e.target.value)}
          className="flex-1"
        />
        
        <button
          onClick={toggleShuffle}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isShuffleOn ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={isShuffleOn ? "Shuffle On" : "Shuffle Off"}
        >
          <FaRandom />
        </button>
        
        <button
          onClick={toggleLoop}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isLoopOn ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={isLoopOn ? "Loop On" : "Loop Off"}
        >
          <FaRedo />
        </button>
      </div>
    </div>
  );
}

export default function RootLayout({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!Cookies.get('token'));

  const handleLogout = () => {
    Cookies.remove('token');
    setIsLoggedIn(false);
  };

  return (
    <html lang="en">
      <body className="bg-gray-100">
        <AudioProvider>
          <nav className="bg-blue-600 p-4 text-white">
            <div className="max-w-4xl mx-auto flex justify-between">
              <Link href="/" className="text-xl font-bold">JamShot</Link>
              <div>
                {isLoggedIn ? (
                  <>
                    <Link href="/upload" className="mr-4">Upload</Link>
                    <button onClick={handleLogout} className="bg-red-500 px-2 py-1 rounded">Logout</button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="mr-4">Login</Link>
                    <Link href="/register">Register</Link>
                  </>
                )}
              </div>
            </div>
          </nav>
          <main className="max-w-4xl mx-auto p-4 pb-16">{children}</main> {/* Padding for player */}
          <GlobalPlayer />
        </AudioProvider>
      </body>
    </html>
  );
}