'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '../contexts/UserContext';
import api from '../lib/api';

export default function LoginForm({ 
  onSuccess, 
  onError,
  redirectUrl = null,
  showLinks = true,
  noRedirect = false
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [isEmailNotVerified, setIsEmailNotVerified] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { login } = useUser();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsEmailNotVerified(false);
    setIsLoggingIn(true);
    
    try {
      // Use the login function from UserContext
      const result = await login(email, password, redirectUrl, noRedirect);
      
      if (!result.success) {
        if (result.isEmailNotVerified) {
          setIsEmailNotVerified(true);
          setError('Your email is not verified. Please verify your email to log in.');
        } else {
          setError(result.error || 'Login failed');
        }
        if (onError) {
          onError(result.error || 'Login failed');
        }
      } else {
        // Success - call onSuccess callback if provided
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err) {
      const errorMessage = 'An unexpected error occurred. Please try again.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResendingVerification(true);
    try {
      await api.post('/auth/resend-verification', { email });
      setSuccess('Verification email sent! Please check your inbox.');
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend verification email');
      setSuccess('');
    } finally {
      setIsResendingVerification(false);
    }
  };

  return (
    <div>
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
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
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
            {isEmailNotVerified && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResendingVerification}
                  className="text-blue-600 hover:text-blue-800 underline focus:outline-none"
                >
                  {isResendingVerification ? 'Sending...' : 'Resend verification email'}
                </button>
              </div>
            )}
          </div>
        )}
        
        <button 
          type="submit" 
          className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          disabled={isLoggingIn}
        >
          {isLoggingIn ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

