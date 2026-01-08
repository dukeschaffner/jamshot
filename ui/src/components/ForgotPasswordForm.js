'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';
import { validateEmail } from '../lib/validation';

export default function ForgotPasswordForm({ 
  onSuccess, 
  onError,
  redirectUrl = null,
  showLinks = true,
  noRedirect = false
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setError(emailValidation.message);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const frontendUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const resetUrl = `${frontendUrl}/reset-password`;
      
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: resetUrl,
      });

      // Better Auth doesn't reveal if email exists for security reasons
      // So we always show success message
      setSuccess('If your email is registered, you will receive a password reset link.');
      setEmail(''); // Clear the form
      
      if (onSuccess) {
        onSuccess();
      }
      
      // Handle redirect if not disabled
      if (!noRedirect && redirectUrl) {
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 2000);
      }
    } catch (err) {
      const errorMessage = err.message || 'An error occurred. Please try again later.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Forgot password error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {success ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>{success}</p>
          {showLinks && (
            <p className="mt-2">
              <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">
                Return to login
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-4 text-gray-600">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
          
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
                placeholder="Enter your email"
                className="w-full p-2 border rounded"
                required
                disabled={isSubmitting}
              />
            </div>
            
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            
            <button 
              type="submit" 
              className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Reset Link'}
            </button>
            
            {showLinks && (
              <div className="text-center mt-4">
                <Link href="/login" className="text-blue-600 hover:text-blue-800">
                  Back to Login
                </Link>
              </div>
            )}
          </form>
        </>
      )}
    </div>
  );
}

