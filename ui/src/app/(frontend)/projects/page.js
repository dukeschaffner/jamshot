'use client';

import { notFound } from 'next/navigation';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import sharedStyles from '@/styles/Dashboard.module.css';

export default function ProjectsPage() {
  const { isFeatureEnabled, isLoading } = useFeatureFlags();

  if (isLoading) {
    return (
      <div className={sharedStyles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isFeatureEnabled('projects', false)) {
    notFound();
  }

  return (
    <div className={sharedStyles.container}>
      <h1>Projects</h1>
      <p>Your projects will appear here.</p>
    </div>
  );
}
