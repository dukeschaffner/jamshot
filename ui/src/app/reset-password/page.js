'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../lib/auth-client';
import { validatePassword } from '../../lib/validation';

export default function ResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Better Auth uses query parameter ?token=...
  const token = searchParams?.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState('');

  useEffect(() => {
    // Check for error in query params (Better Auth redirects with ?error=INVALID_TOKEN)
    const errorParam = searchParams?.get('error');
    if (errorParam === 'INVALID_TOKEN') {
      setTokenError('Invalid or expired reset token. Please request a new password reset.');
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!token) {
      setError('Reset token is missing. Please request a new password reset.');
      return;
    }
    
    // Validate password format
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      setError(passwordValidation.message);
      return;
    }
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const result = await authClient.resetPassword({
        token,
        newPassword,
      });
      
      if (result.data) {
        setSuccess('Password reset successful!');
        setNewPassword('');
        setConfirmPassword('');
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError('Password reset failed. Please try again.');
      }
    } catch (err) {
      const errorMessage = err.message || 'An error occurred. Please try again later.';
      setError(errorMessage);
      console.error('Reset password error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Reset Password</h1>
      
      {tokenError ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{tokenError}</p>
          <p className="mt-2">
            <Link href="/forgot-password" className="text-blue-600 hover:text-blue-800 underline">
              Request a new password reset
            </Link>
          </p>
        </div>
      ) : success ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>{success}</p>
          <p className="mt-2">
            Redirecting to login page... If you&apos;re not redirected, 
            <Link href="/login" className="text-blue-600 hover:text-blue-800 underline ml-1">
              click here
            </Link>.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-gray-600">
            Enter your new password below.
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full p-2 border rounded"
                required
                disabled={isSubmitting}
              />
              <div className="mt-1 text-xs text-gray-500">
                <p>Password must:</p>
                <ul className="list-disc pl-5">
                  <li>Be at least 8 characters long</li>
                  <li>Contain at least one uppercase letter</li>
                  <li>Contain at least one lowercase letter</li>
                  <li>Contain at least one number</li>
                  <li>Contain at least one special character (!@#$%^&*)</li>
                </ul>
              </div>
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
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
              {isSubmitting ? 'Resetting...' : 'Reset Password'}
            </button>
            
            <div className="text-center mt-4">
              <Link href="/login" className="text-blue-600 hover:text-blue-800">
                Back to Login
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

