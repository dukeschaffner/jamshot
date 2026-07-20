'use client';

import { useEffect, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useUser } from '@/contexts/UserContext';
import { projectApi } from '@/lib/api';
import ProjectsList from '@/components/projects/ProjectsList';
import LoadingSpinner from '@/components/LoadingSpinner';
import sharedStyles from '@/styles/Dashboard.module.css';

export default function ProjectsPage() {
  const router = useRouter();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const { isAuthenticated, isLoading: userLoading } = useUser();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (flagsLoading || userLoading) return;

    if (!isFeatureEnabled('projects', false)) {
      return;
    }

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await projectApi.listProjects();
        if (!cancelled) {
          setProjects(response.data?.projects || []);
        }
      } catch (err) {
        console.error('Error loading projects:', err);
        if (!cancelled) {
          setError('Failed to load projects');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [flagsLoading, userLoading, isFeatureEnabled, isAuthenticated, router]);

  if (flagsLoading || userLoading) {
    return (
      <div className={sharedStyles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isFeatureEnabled('projects', false)) {
    notFound();
  }

  if (!isAuthenticated) {
    return (
      <div className={sharedStyles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={sharedStyles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={sharedStyles.container}>
      <ProjectsList
        projects={projects}
        error={error}
        onProjectRemoved={(guid) =>
          setProjects((prev) => prev.filter((p) => p.guid !== guid))
        }
      />
    </div>
  );
}
