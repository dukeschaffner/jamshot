'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AudioProvider, useAudio } from '../lib/AudioContext';
import { NotificationProvider } from '../lib/NotificationContext';
import { UserProvider, useUser } from '../contexts/UserContext';
import { MobileProvider } from '../contexts/MobileContext';
import { NavigationGuardProvider } from 'next-navigation-guard';
import { initGA, trackPageView, trackSearch } from '../lib/analytics';
import Navbar from '../components/Navbar';
import MobileNavbar from '../components/MobileNavbar';
import GlobalPlayer from '../components/GlobalPlayer';
import ReleaseNotesToast from '../components/ReleaseNotesToast';
import api from '../lib/api';

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


  return (
    <div className={`app-container ${playerVisible ? 'player-visible' : ''}`}>
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
      
      {/* Release Notes Toast */}
      <ReleaseNotesToast />
    </div>
  );
}

export default function ClientLayout({ children }) {
  return (
    <UserProvider>
      <MobileProvider>
        <AudioProvider>
          <NotificationProvider>
            <NavigationGuardProvider>
              <AppContent>
                {children}
              </AppContent>
            </NavigationGuardProvider>
          </NotificationProvider>
        </AudioProvider>
      </MobileProvider>
    </UserProvider>
  );
}

