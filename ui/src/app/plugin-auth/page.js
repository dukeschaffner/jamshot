'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

function PluginAuthContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    const redirectUri = searchParams.get('redirect_uri');
    if (!redirectUri) {
      setError('Missing redirect_uri parameter');
      setStatus('error');
      return;
    }

    // Only allow localhost redirect for plugin security
    try {
      const url = new URL(redirectUri);
      const isLocalhost =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]';
      if (!isLocalhost) {
        setError('redirect_uri must be localhost');
        setStatus('error');
        return;
      }
    } catch {
      setError('Invalid redirect_uri');
      setStatus('error');
      return;
    }

    const fetchAndRedirect = async () => {
      try {
        const res = await fetch(`${API_URL}/plugin-auth/tokens`, {
          credentials: 'include',
        });

        if (res.status === 401) {
          const loginUrl = `${window.location.origin}/login?redirect=${encodeURIComponent(
            window.location.href
          )}`;
          window.location.href = loginUrl;
          return;
        }

        if (!res.ok) {
          throw new Error('Failed to get tokens');
        }

        const { accessToken, refreshToken } = await res.json();
        const sep = redirectUri.includes('?') ? '&' : '?';
        const callbackUrl =
          redirectUri +
          sep +
          `access_token=${encodeURIComponent(accessToken)}` +
          `&refresh_token=${encodeURIComponent(refreshToken || accessToken)}`;
        window.location.href = callbackUrl;
      } catch (err) {
        console.error('Plugin auth error:', err);
        setError(err.message || 'Failed to connect plugin');
        setStatus('error');
      }
    };

    fetchAndRedirect();
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1a1a1a] text-white p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4" />
        <p className="text-lg">Connecting plugin...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1a1a1a] text-white p-6">
        <p className="text-lg text-red-400 mb-4">{error}</p>
        <a
          href="/login"
          className="text-primary hover:underline"
        >
          Log in to Sterio
        </a>
      </div>
    );
  }

  return null;
}

export default function PluginAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-[#1a1a1a]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
        </div>
      }
    >
      <PluginAuthContent />
    </Suspense>
  );
}
