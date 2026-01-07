'use client';

import { useState, useEffect } from 'react';
import { createAuthClient } from 'better-auth/client';

const authClient = createAuthClient({
  baseURL: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001') + '/auth'
});

export default function Login2() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [debug, setDebug] = useState([]);

  // Add debug message
  const addDebug = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    const debugMessage = `${timestamp}: ${message}`;
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
    setDebug(prev => [...prev, debugMessage]);
  };

  // Check if user is already logged in
  useEffect(() => {
    addDebug('Checking current session...');
    authClient.getSession()
      .then((session) => {
        if (session?.data?.user) {
          addDebug('User already logged in:', session.data.user);
          setUser(session.data.user);
        } else {
          addDebug('No active session found');
        }
      })
      .catch((error) => {
        addDebug('Error checking session:', error);
      });
  }, []);

  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    addDebug(`Attempting email/password login for: ${email}`);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      addDebug('Email/password login result:', result);

      if (result.data?.user) {
        addDebug('Login successful! User:', result.data.user);
        setUser(result.data.user);
      } else {
        addDebug('Login failed - no user data returned');
      }
    } catch (error) {
      addDebug('Email/password login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    addDebug('Starting Google OAuth login...');
    setLoading(true);

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin + '/login2'
      });

      addDebug('Google OAuth result:', result);

      // The redirect should happen automatically
      // If we get here, there might be an issue
      if (result.url) {
        addDebug('Redirecting to Google:', result.url);
        window.location.href = result.url;
      } else {
        addDebug('No redirect URL received');
      }
    } catch (error) {
      addDebug('Google OAuth error:', error);
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    addDebug(`Attempting sign up for: ${email} with username: ${username} and name: ${name}`);

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
        username,
      });

      addDebug('Sign up result:', result);

      if (result.data?.user) {
        addDebug('Sign up successful! User:', result.data.user);
        setUser(result.data.user);
      } else {
        addDebug('Sign up failed - no user data returned');
      }
    } catch (error) {
      addDebug('Sign up error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    addDebug('Logging out...');
    try {
      await authClient.signOut();
      addDebug('Logout successful');
      setUser(null);
    } catch (error) {
      addDebug('Logout error:', error);
    }
  };

  const clearDebug = () => {
    setDebug([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-3xl font-bold mb-6 text-center">Better Auth Test Page</h1>

      {user ? (
        <div className="mb-6 p-4 bg-green-100 border border-green-400 rounded">
          <h2 className="text-xl font-bold text-green-800 mb-2">Logged In!</h2>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>ID:</strong> {user.id}</p>
          <p><strong>Name:</strong> {user.name || 'N/A'}</p>
          <p><strong>Email Verified:</strong> {user.emailVerified ? 'Yes' : 'No'}</p>
          <button
            onClick={handleLogout}
            className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Email/Password Login */}
          <div className="border rounded p-4">
            <h2 className="text-xl font-bold mb-4">Email & Password Login</h2>
            <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="w-full p-2 border rounded"
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password123"
                  className="w-full p-2 border rounded"
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </div>
            </form>

            {/* Sign Up Form */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="text-lg font-semibold mb-3">Sign Up</h3>
              <form onSubmit={(e) => { e.preventDefault(); handleSignUp(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="johndoe"
                    className="w-full p-2 border rounded"
                    required
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full p-2 border rounded"
                    required
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email || !password || !name || !username}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>
            </div>
          </div>

          {/* Google OAuth */}
          <div className="border rounded p-4">
            <h2 className="text-xl font-bold mb-4">Google OAuth</h2>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? 'Redirecting...' : 'Login with Google'}
            </button>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <div className="mt-8 border-t pt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Debug Log</h2>
          <button
            onClick={clearDebug}
            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
          >
            Clear
          </button>
        </div>
        <div className="bg-gray-100 p-4 rounded max-h-96 overflow-y-auto">
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {debug.length === 0 ? 'No debug messages yet...' : debug.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
}
