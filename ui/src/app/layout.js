'use client';
import { useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import './globals.css';
import { AudioProvider, useAudio } from '../lib/AudioContext';

function GlobalPlayer() {
  const { currentTrack, isPlaying, progress, togglePlayPause, seek } = useAudio();

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white p-4 flex items-center space-x-4">
      <button
        onClick={togglePlayPause}
        className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600"
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium">{currentTrack.title}</p>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={progress}
        onChange={(e) => seek(e.target.value)}
        className="w-1/2"
      />
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