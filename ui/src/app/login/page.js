'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoginForm from '../../components/LoginForm';

// Component that uses useSearchParams
function LoginContent() {
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get redirect URL from query params
  const redirectUrl = searchParams.get('redirect');

  // Check for messages on component mount
  useEffect(() => {
    // Check if user just verified their email
    const verified = searchParams.get('verified');
    if (verified === 'true') {
      setSuccess('Email verified successfully! You can now log in.');
    }
    
    // Check for OAuth error from redirect
    const oauthError = searchParams.get('error');
    const errorType = searchParams.get('errorType');
    if (oauthError && errorType === 'oauth') {
      setError(decodeURIComponent(oauthError));
      // Clean up URL by removing error parameters
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('error');
        url.searchParams.delete('errorType');
        window.history.replaceState({}, '', url.toString());
      }
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

  const handleLoginSuccess = () => {
    // Handle successful login - redirect will be handled by LoginForm
    console.log('Login successful');
  };

  const handleLoginError = (errorMessage) => {
    setError(errorMessage);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Login</h1>
      
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
      
      <LoginForm
        onSuccess={handleLoginSuccess}
        onError={handleLoginError}
        redirectUrl={redirectUrl}
        showLinks={true}
        noRedirect={false}
      />
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