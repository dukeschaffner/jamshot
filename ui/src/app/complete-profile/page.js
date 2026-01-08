'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import CompleteProfileForm from '../../components/CompleteProfileForm';

// Component that uses useSearchParams
function CompleteProfileContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const session = await authClient.getSession();
        if (!session?.data?.session?.user) {
          // Not logged in, redirect to login
          router.push('/login');
          return;
        }

        const currentUser = session.data.session.user;
        setUser(currentUser);

        // Check if profile is already complete
        // We'll need to fetch full user data to check date_of_birth and terms_accepted
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/users/me`, {
            credentials: 'include',
          });

          if (response.ok) {
            const userData = await response.json();
            // If user already has date_of_birth and terms_accepted, redirect
            if (userData.date_of_birth && userData.terms_accepted && userData.privacy_policy_accepted) {
              // Get redirect URL from query params or default to home
              const redirectUrl = searchParams.get('redirect') || '/';
              router.push(redirectUrl);
              return;
            }
          }
        } catch (err) {
          console.error('Error checking user profile:', err);
        }
      } catch (err) {
        console.error('Error checking session:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Complete Your Profile</h1>
      <p className="text-gray-600 mb-6">
        We need a few more details to complete your account setup.
      </p>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <CompleteProfileForm
        onSuccess={() => {
          const redirectUrl = searchParams.get('redirect') || '/';
          router.push(redirectUrl);
        }}
        onError={(errorMessage) => setError(errorMessage)}
      />
    </div>
  );
}

// Main page component with Suspense
export default function CompleteProfile() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <CompleteProfileContent />
    </Suspense>
  );
}

