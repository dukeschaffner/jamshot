'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '../../contexts/UserContext';
import CompleteProfileForm from '../../components/CompleteProfileForm';

// Component that uses useSearchParams
function CompleteProfileContent() {
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, isAuthenticated, refreshUser } = useUser();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If not authenticated, UserContext will handle redirect to login
  // If authenticated and profile complete, UserContext will handle redirect away
  // So if we reach here, user is authenticated but profile is incomplete

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
        onSuccess={async () => {
          // Refresh user session to get updated profile_completed status
          await refreshUser();
          // Small delay to ensure session is updated before redirect
          setTimeout(() => {
            const redirectUrl = searchParams.get('redirect') || '/';
            router.push(redirectUrl);
          }, 100);
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

