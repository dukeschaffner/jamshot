'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AudioProvider, useAudio } from '@/lib/AudioContext';
import { NotificationProvider } from '@/lib/NotificationContext';
import { ToastProvider } from '@/lib/ToastContext';
import { UserProvider, useUser } from '@/contexts/UserContext';
import { FeatureFlagsProvider } from '@/contexts/FeatureFlagsContext';
import { MobileProvider } from '@/contexts/MobileContext';
import { NavigationGuardProvider } from '@/contexts/NavigationGuardContext';
import { initGA, trackPageView } from '@/lib/analytics';
import Navbar from '@/components/Navbar';
import MobileNavbar from '@/components/MobileNavbar';
import GlobalPlayer from '@/components/GlobalPlayer';
import ReleaseNotesToast from '@/components/ReleaseNotesToast';
import CompleteProfileForm from '@/components/CompleteProfileForm';
import { isDedicatedMarketingPath } from '@/lib/marketing/constants';
import { isOutreachShortPath } from '@/lib/outreachShortPath';
import { consumeMarketingHomeNavigation } from '@/lib/marketing/marketingHomeNav';
import { PluginWebSocketProvider } from '@/contexts/PluginWebSocketContext';
import {
  captureOutreachCodeFromUrl,
  flushOutreachAttribution,
} from '@/lib/outreachAttribution';

function AppContent({ children }) {
  const {
    isAuthenticated,
    needsToCompleteProfile,
    isLoading,
    logout,
    refreshUser,
  } = useUser();
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const { currentTrack, togglePlayPause, spaceShortcutEnabled } = useAudio();
  const [profileError, setProfileError] = useState('');

  const pathname = usePathname();
  const playerVisible = !!currentTrack;
  const showMarketingShell =
    pathname === '/' ||
    isDedicatedMarketingPath(pathname) ||
    isOutreachShortPath(pathname);

  useEffect(() => {
    captureOutreachCodeFromUrl();
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    flushOutreachAttribution();
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (pathname !== '/' || isLoading) return;
    if (!isAuthenticated && !needsToCompleteProfile) return;
    if (consumeMarketingHomeNavigation()) return;
    router.replace('/feed');
  }, [pathname, isAuthenticated, needsToCompleteProfile, isLoading, router]);

  useEffect(() => {
    initGA();
  }, []);

  useEffect(() => {
    if (pathname) {
      trackPageView(window.location.href, document.title);
    }
  }, [pathname]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!spaceShortcutEnabled) return;
      if (currentTrack && e.code === 'Space') {
        const activeElement = document.activeElement;
        const isFormElement = activeElement.tagName === 'INPUT' ||
                            activeElement.tagName === 'TEXTAREA' ||
                            activeElement.tagName === 'BUTTON' ||
                            activeElement.isContentEditable;

        if (!isFormElement) {
          e.preventDefault();
          togglePlayPause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentTrack, togglePlayPause, spaceShortcutEnabled]);

  const allowDarkMode = false;

  useEffect(() => {
    if (allowDarkMode) {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
        setDarkMode(true);
      }
    }
  }, []);

  if (showMarketingShell) {
    return <>{children}</>;
  }

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
              setProfileError('');
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
      <Navbar />
      <MobileNavbar />
      <main className="main-content">
        {children}
      </main>
      <GlobalPlayer />
      <ReleaseNotesToast />
    </div>
  );
}

export default function AppChrome({ children }) {
  return (
    <FeatureFlagsProvider>
      <UserProvider>
        <MobileProvider>
          <AudioProvider>
            <ToastProvider>
              <NotificationProvider>
                <NavigationGuardProvider>
                  <PluginWebSocketProvider>
                    <AppContent>
                      {children}
                    </AppContent>
                  </PluginWebSocketProvider>
                </NavigationGuardProvider>
              </NotificationProvider>
            </ToastProvider>
          </AudioProvider>
        </MobileProvider>
      </UserProvider>
    </FeatureFlagsProvider>
  );
}
