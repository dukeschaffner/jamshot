'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '../lib/ToastContext';

export default function ReleaseNotesToast() {
  const [latestRelease, setLatestRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toastId, setToastId] = useState(null);
  const router = useRouter();
  const { showToast, dismissToast } = useToast();

  useEffect(() => {
    const checkForNewRelease = async () => {
      try {
        setLoading(true);
        const response = await api.get('/release-notes/latest');
        
        if (response.data) {
          const latestVersion = response.data.version;
          const lastViewedVersion = localStorage.getItem('sterio_last_viewed_release_version');
          
          // Show toast if there's a new release and user hasn't seen it
          if (!lastViewedVersion || latestVersion > lastViewedVersion) {
            setLatestRelease(response.data);
            
            const id = showToast({
              variant: 'release',
              title: 'New Update Available!',
              message: `${response.data.title} - v${response.data.version}`,
              duration: 0, // Don't auto-dismiss
              action: true,
              actionLabel: 'View',
              onAction: () => {
                localStorage.setItem('sterio_last_viewed_release_version', response.data.version);
                dismissToast(id);
                router.push('/release-notes');
              },
            });
            
            setToastId(id);
          }
        }
      } catch (err) {
        console.error('Failed to check for new release:', err);
      } finally {
        setLoading(false);
      }
    };

    // Small delay to avoid showing toast immediately on page load
    const timer = setTimeout(() => {
      checkForNewRelease();
    }, 1000);

    return () => {
      clearTimeout(timer);
      if (toastId) {
        dismissToast(toastId);
      }
    };
  }, [showToast, dismissToast, router, toastId]);

  return null;
}

