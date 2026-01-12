'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AudioProvider, useAudio } from '../lib/AudioContext';
import { NotificationProvider } from '../lib/NotificationContext';
import { ToastProvider } from '../lib/ToastContext';
import { UserProvider, useUser } from '../contexts/UserContext';
import { FeatureFlagsProvider } from '../contexts/FeatureFlagsContext';
import { MobileProvider } from '../contexts/MobileContext';
import { NavigationGuardProvider } from 'next-navigation-guard';
import { initGA, trackPageView, trackSearch } from '../lib/analytics';
import Navbar from '../components/Navbar';
import MobileNavbar from '../components/MobileNavbar';
import GlobalPlayer from '../components/GlobalPlayer';
import ReleaseNotesToast from '../components/ReleaseNotesToast';
import LandingPage from '../components/LandingPage';
import LoadingSpinner from '../components/LoadingSpinner';
import CompleteProfileForm from '../components/CompleteProfileForm';
import api from '../lib/api';

// This component will be rendered after providers are initialized
function AppContent({ children }) {
  const { user, isLoading, isAuthenticated, needsToCompleteProfile, logout, refreshUser } = useUser();
  const [darkMode, setDarkMode] = useState(false);
  const { currentTrack, isPlaying, togglePlayPause } = useAudio();
  const [hasAccess, setHasAccess] = useState(false);
  const [accessCheckComplete, setAccessCheckComplete] = useState(false);
  const [profileError, setProfileError] = useState('');
  
  // Check if we're on pages where player should be hidden
  const pathname = usePathname();
  const isUploadPage = pathname === '/upload';
  const isTrackPage = pathname.startsWith('/track/');
  const shouldHidePlayer = isUploadPage || isTrackPage;
  
  const playerVisible = !!currentTrack && !shouldHidePlayer;

  // Check for access on mount
  useEffect(() => {
    const checkAccess = () => {
      // Check if user has access granted in session
      const accessGranted = sessionStorage.getItem('sterio_access_granted');
      if (accessGranted === 'true') {
        setHasAccess(true);
      }
      setAccessCheckComplete(true);
    };
    
    checkAccess();
  }, []);

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

  // Handle access granted
  const handleAccessGranted = () => {
    setHasAccess(true);
  };

  // Show landing page if access check is complete and user doesn't have access and is not authenticated
  if (accessCheckComplete && !hasAccess && !isAuthenticated) {
    return <LandingPage onAccessGranted={handleAccessGranted} />;
  }

  // Show loading state while checking access
  if (!accessCheckComplete) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        background: 'var(--background)',
        color: 'var(--text-primary)'
      }}>
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Show complete profile form if needed
  if (needsToCompleteProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full mx-auto p-6 bg-white rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4">Complete Your Profile</h1>
          <p className="text-gray-600 mb-6">
            We need a few more details to complete your account setup.
          </p>
          
          {profileError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {profileError}
            </div>
          )}
          
          <CompleteProfileForm
            onSuccess={async () => {
              // Clear any previous errors
              setProfileError('');
              // Refresh user session to get updated profile_completed status
              await refreshUser();
            }}
            onError={(errorMessage) => setProfileError(errorMessage)}
            onLogout={logout}
          />
        </div>
      </div>
    );
  }

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
    <FeatureFlagsProvider>
      <UserProvider>
        <MobileProvider>
          <AudioProvider>
            <ToastProvider>
              <NotificationProvider>
                <NavigationGuardProvider>
                  <AppContent>
                    {children}
                  </AppContent>
                </NavigationGuardProvider>
              </NotificationProvider>
            </ToastProvider>
          </AudioProvider>
        </MobileProvider>
      </UserProvider>
    </FeatureFlagsProvider>
  );
}

