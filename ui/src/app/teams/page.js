'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../contexts/UserContext';
import TeamsLanding from '../../components/teams/TeamsLanding';
import TeamsList from '../../components/teams/TeamsList';
import LoadingSpinner from '../../components/LoadingSpinner';
import sharedStyles from '../../styles/Dashboard.module.css';

export default function TeamsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useUser();

  useEffect(() => {
    // Wait for auth check to complete
    if (isLoading) return;

    // If authenticated and has exactly 1 team, redirect to that team's dashboard
    if (isAuthenticated && user?.teams?.length === 1) {
      router.replace(`/team/${user.teams[0].id}`);
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

  // Not authenticated OR authenticated with 0 teams → Show landing page
  if (!isAuthenticated || !user?.teams || user.teams.length === 0) {
    return (
      <div className={sharedStyles.container}>
        <TeamsLanding />
      </div>
    );
  }

  // Authenticated with 2+ teams → Show list page
  // (1 team case is handled by useEffect redirect above)
  if (user.teams.length >= 2) {
    return (
      <div className={sharedStyles.container}>
        <TeamsList teams={user.teams} />
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

