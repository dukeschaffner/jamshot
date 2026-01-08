'use client';
import { useState } from 'react';
import Link from 'next/link';
import { validateDateOfBirth } from '../../shared/utils/validation';

export default function CompleteProfileForm({ 
  onSuccess, 
  onError
}) {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate date of birth
    const dobValidation = validateDateOfBirth(dateOfBirth);
    if (!dobValidation.valid) {
      setError(dobValidation.error);
      return;
    }
    
    // Check if terms are accepted
    if (!acceptTerms) {
      setError('You must accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/users/me/complete-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          dateOfBirth,
          acceptTerms: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete profile');
      }

      const result = await response.json();
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to complete profile. Please try again.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Complete profile error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
          Date of Birth
        </label>
        <input
          id="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="w-full p-2 border rounded"
          required
          disabled={isSubmitting}
          max={new Date().toISOString().split('T')[0]} // Prevent future dates
        />
        <p className="text-xs text-gray-500 mt-1">You must be at least 13 years old to use this service.</p>
      </div>
      
      <div className="flex items-start space-x-2">
        <input
          id="acceptTerms"
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          className="mt-1"
          required
          disabled={isSubmitting}
        />
        <label htmlFor="acceptTerms" className="text-sm text-gray-700">
          I agree to the{' '}
          <Link href="/terms" className="text-seafoam hover:underline" target="_blank">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-seafoam hover:underline" target="_blank">
            Privacy Policy
          </Link>
        </label>
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
        {isSubmitting ? 'Completing...' : 'Complete Profile'}
      </button>
    </form>
  );
}

