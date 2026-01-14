import { useState, useEffect } from 'react';
import { authClient } from '../lib/auth.js';
import './OAuthTester.css';

export default function OAuthTester() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:5001');

  const checkSession = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authClient.getSession();
      setSession(response?.data?.session || response?.session || null);
    } catch (err) {
      console.error('Error checking session:', err);
      setError(err.message || 'Failed to check session');
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      setLoading(true);
      // POST to better-auth social sign-in endpoint
      const response = await fetch(`${apiUrl}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          provider: 'google',
          callbackURL: window.location.origin,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // If we get a redirect URL, navigate to it
      if (data.url && data.redirect) {
        window.location.href = data.url;
      } else {
        throw new Error('No redirect URL received from server');
      }
    } catch (err) {
      console.error('Error signing in with Google:', err);
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setError(null);
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            setSession(null);
          }
        }
      });
      setSession(null);
    } catch (err) {
      console.error('Error signing out:', err);
      setError(err.message || 'Failed to sign out');
      // Clear session locally even if API call fails
      setSession(null);
    }
  };

  // Check session on mount and handle OAuth callback
  useEffect(() => {
    checkSession();
    
    // Handle OAuth callback - check if we're returning from OAuth flow
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('code') || urlParams.get('error')) {
      // OAuth callback detected, check session after a brief delay
      setTimeout(() => {
        checkSession();
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="oauth-tester">
      <h1>Google OAuth Tester</h1>
      
      <div className="config-section">
        <label>
          API URL:
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:5001"
          />
        </label>
        <button onClick={checkSession}>Refresh Session</button>
      </div>

      {loading && <div className="status loading">Loading...</div>}
      
      {error && (
        <div className="status error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="session-section">
        <h2>Session Status</h2>
        {session ? (
          <div className="session-info">
            <div className="status success">✓ Authenticated</div>
            <div className="session-details">
              <h3>User Info:</h3>
              <pre>{JSON.stringify(session.user, null, 2)}</pre>
              <h3>Session Data:</h3>
              <pre>{JSON.stringify(session, null, 2)}</pre>
            </div>
            <button onClick={handleSignOut} className="btn-signout">
              Sign Out
            </button>
          </div>
        ) : (
          <div className="session-info">
            <div className="status unauthenticated">✗ Not Authenticated</div>
            <button onClick={handleGoogleSignIn} className="btn-google">
              Sign in with Google
            </button>
          </div>
        )}
      </div>

      <div className="info-section">
        <h2>API Endpoints</h2>
        <ul>
          <li><code>GET {apiUrl}/api/auth/session</code> - Get current session</li>
          <li><code>POST {apiUrl}/api/auth/sign-in/social</code> - Initiate Google OAuth (with body: {'{"provider": "google"}'})</li>
          <li><code>POST {apiUrl}/api/auth/sign-out</code> - Sign out</li>
        </ul>
      </div>
    </div>
  );
}

