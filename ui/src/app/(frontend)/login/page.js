'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import LoginForm from '@/components/LoginForm';

// Component that uses useSearchParams
function LoginContent() {
  const searchParams = useSearchParams();

  // Get redirect URL from query params
  const redirectUrl = searchParams.get('redirect');

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <LoginForm
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