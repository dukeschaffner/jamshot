'use client';
import { useState } from 'react';
import { authClient } from '../lib/auth-client';

export default function EmailVerificationForm({ 
  onSuccess, 
  onError,
  onLogout,
  userEmail
}) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isResending, setIsResending] = useState(false);

  const handleResend = async () => {
    setError('');
    setSuccess('');
    setIsResending(true);
    
    try {
      const { data, error: resendError } = await authClient.sendVerificationEmail({
        email: userEmail,
        callbackURL: '/',
      });

      if (resendError) {
        throw new Error(resendError.message || 'Failed to resend verification email');
      }

      setSuccess('Verification email sent! Please check your inbox and click the verification link.');
    } catch (err) {
      const errorMessage = err.message || 'Failed to resend verification email. Please try again.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Resend verification email error:', err);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-gray-700 mb-2">
          We've sent a verification email to <strong>{userEmail}</strong>
        </p>
        <p className="text-sm text-gray-600">
          Please check your inbox and click the verification link to verify your email address. 
          If you don't see the email, check your spam folder.
        </p>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}
      
      <button 
        type="button" 
        onClick={handleResend}
        className="w-full pill-btn gradient-btn disabled:opacity-50"
        disabled={isResending}
      >
        {isResending ? 'Sending...' : 'Resend Verification Email'}
      </button>
      
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="w-full mt-3 pill-btn disabled:opacity-50"
          disabled={isResending}
        >
          Logout
        </button>
      )}
    </div>
  );
}

