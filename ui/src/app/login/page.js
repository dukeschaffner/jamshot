'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '../../contexts/UserContext';
import api from '../../lib/api';

// Component that uses useSearchParams
function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [isEmailNotVerified, setIsEmailNotVerified] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useUser();

  // Check for messages on component mount
  useEffect(() => {
    // Check if user just verified their email
    const verified = searchParams.get('verified');
    if (verified === 'true') {
      setSuccess('Email verified successfully! You can now log in.');
    }
    
    // Check for auth error message (e.g., expired token)
    if (typeof window !== 'undefined') {
      const authError = sessionStorage.getItem('authError');
      if (authError) {
        setError(authError);
        sessionStorage.removeItem('authError'); // Clear the message after displaying it
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsEmailNotVerified(false);
    setIsLoggingIn(true);
    
    try {
      // Use the login function from UserContext
      const result = await login(email, password);
      
      if (!result.success) {
        if (result.isEmailNotVerified) {
          setIsEmailNotVerified(true);
          setError('Your email is not verified. Please verify your email to log in.');
        } else {
          setError(result.error || 'Login failed');
        }
      }
      // No need to handle success case with router.push as it's now handled in the UserContext
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
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
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Login</h1>
      
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
        
        <div className="text-center mt-4">
          <Link href="/forgot-password" className="text-blue-600 hover:text-blue-800">
            Forgot password?
          </Link>
        </div>
        
        <div className="text-center mt-2">
          <span className="text-gray-600">Don&apos;t have an account? </span>
          <Link href="/register" className="text-blue-600 hover:text-blue-800">
            Register
          </Link>
        </div>
      </form>
    </div>
  );
}

// Main page component with Suspense
export default function Login() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}