'use client';
import { useState } from 'react';
import Link from 'next/link';
import api from '../../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    
    try {
      const response = await api.post('/auth/forgot-password', { email });
      setSuccess(response.data.message || 'If your email is registered, you will receive a password reset link.');
      setEmail(''); // Clear the form
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Forgot Password</h1>
      
      {success ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>{success}</p>
          <p className="mt-2">
            <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">
              Return to login
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-gray-600">
            Enter your email address and we'll send you a link to reset your password.
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
              />
            </div>
            
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            
            <button 
              type="submit" 
              className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Reset Link'}
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