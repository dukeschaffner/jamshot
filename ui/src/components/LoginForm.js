'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';
import { useRouter } from 'next/navigation';

export default function LoginForm({ 
  onSuccess, 
  onError,
  redirectUrl = null,
  showLinks = true,
  noRedirect = false
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();

  // Check if user is already logged in
  useEffect(() => {
    authClient.getSession()
      .then((session) => {
        if (session?.data?.user) {
          setUser(session.data.user);
          if (onSuccess && !noRedirect) {
            onSuccess();
          }
        }
      })
      .catch((error) => {
        console.error('Error checking session:', error);
      });
  }, [onSuccess, noRedirect]);

  useEffect(() => {
    console.log('user lgoin', user);
  }, [user]);

  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoggingIn(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.data?.user) {
        setUser(result.data.user);
        setSuccess('Login successful!');
        if (onSuccess) {
          onSuccess();
        }
        // Handle redirect if not disabled
        if (!noRedirect && redirectUrl) {
          router.push(redirectUrl);
        } else if (!noRedirect) {
          router.push('/');
        }
      } else {
        const errorMessage = 'Login failed - no user data returned';
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Login failed. Please check your credentials.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Email/password login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoggingIn(true);

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin + (redirectUrl || '/dashboard')
      });

      if (result.url) {
        window.location.href = result.url;
      } else {
        const errorMessage = 'No redirect URL received from Google OAuth';
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Google OAuth failed. Please try again.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Google OAuth error:', err);
      setIsLoggingIn(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoggingIn(true);

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
        username,
      });

      if (result.data?.user) {
        setUser(result.data.user);
        setSuccess('Account created successfully!');
        if (onSuccess) {
          onSuccess();
        }
        // Handle redirect if not disabled
        if (!noRedirect && redirectUrl) {
          window.location.href = redirectUrl;
        } else if (!noRedirect) {
          window.location.href = '/dashboard';
        }
      } else {
        const errorMessage = 'Sign up failed - no user data returned';
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Sign up failed. Please try again.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Sign up error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      setUser(null);
      setSuccess('Logged out successfully');
    } catch (error) {
      setError('Logout failed');
      console.error('Logout error:', error);
    }
  };

  // If user is already logged in, show logged in state
  if (user) {
    return (
      <div className="p-4 bg-green-100 border border-green-400 rounded">
        <h2 className="text-xl font-bold text-green-800 mb-2">Logged In!</h2>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Name:</strong> {user.name || 'N/A'}</p>
        <button
          onClick={handleLogout}
          className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div>
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Google OAuth Button */}
      <div className="mb-4">
        <button
          onClick={handleGoogleLogin}
          disabled={isLoggingIn}
          className="w-full bg-white hover:bg-gray-50 text-gray-900 px-4 py-2 rounded border border-gray-300 disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-sm">{isLoggingIn ? 'Redirecting...' : 'Continue with Google'}</span>
        </button>
      </div>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">Or continue with email</span>
        </div>
      </div>
      
      {/* Toggle between Login and Sign Up */}
      <div className="mb-4 text-center">
        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-blue-600 hover:text-blue-800 underline"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={isSignUp ? handleSignUp : handleEmailPasswordLogin} className="space-y-4">
        {isSignUp && (
          <>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full p-2 border rounded"
                required
                disabled={isLoggingIn}
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                className="w-full p-2 border rounded"
                required
                disabled={isLoggingIn}
              />
            </div>
          </>
        )}
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full p-2 border rounded"
            required
            disabled={isLoggingIn}
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full p-2 border rounded"
            required
            disabled={isLoggingIn}
          />
        </div>
        
        <button 
          type="submit" 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={isLoggingIn}
        >
          {isLoggingIn 
            ? (isSignUp ? 'Creating account...' : 'Logging in...') 
            : (isSignUp ? 'Create Account' : 'Login')
          }
        </button>
      </form>

      {showLinks && !isSignUp && (
        <div className="mt-4 space-y-2 text-center text-sm">
          <Link href="/forgot-password" className="text-blue-600 hover:text-blue-800 block">
            Forgot password?
          </Link>
        </div>
      )}
    </div>
  );
}

