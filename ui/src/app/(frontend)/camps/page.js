'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import CampsLanding from '@/components/camps/CampsLanding';
import CampsList from '@/components/camps/CampsList';
import LoadingSpinner from '@/components/LoadingSpinner';
import sharedStyles from '@/styles/Dashboard.module.css';

export default function CampsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useUser();

  useEffect(() => {
    // Wait for auth check to complete
    if (isLoading) return;

    // If authenticated and has exactly 1 camp, redirect to that camp's dashboard
    if (isAuthenticated && user?.camps?.length === 1) {
      router.replace(`/camp/${user.camps[0].id}`);
    }
  }, [isAuthenticated, isLoading, user, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className={sharedStyles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  // Not authenticated OR authenticated with 0 camps → Show landing page
  if (!isAuthenticated || !user?.camps || user.camps.length === 0) {
    return (
      <div className={sharedStyles.container}>
        <CampsLanding />
      </div>
    );
  }

  // Authenticated with 2+ camps → Show list page
  // (1 camp case is handled by useEffect redirect above)
  if (user.camps.length >= 2) {
    return (
      <div className={sharedStyles.container}>
        <CampsList camps={user.camps} />
      </div>
    );
  }

  // Fallback (shouldn't reach here, but show loading just in case)
  return (
    <div className={sharedStyles.container}>
      <LoadingSpinner />
    </div>
  );
}

