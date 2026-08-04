'use client';

import { useEffect, useMemo, useState } from 'react';
import { projectApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import ProjectsList from '@/components/projects/ProjectsList';
import sharedStyles from '@/styles/Dashboard.module.css';

/**
 * Team/camp-scoped projects tab. Pass exactly one of teamId or campId.
 */
export default function ProjectsTab({ teamId, campId }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const createHref = useMemo(() => {
    if (teamId != null) return `/projects/create?team_id=${teamId}`;
    if (campId != null) return `/projects/create?camp_id=${campId}`;
    return '/projects/create';
  }, [teamId, campId]);

  const listParams = useMemo(() => {
    if (teamId != null) return { team_id: teamId };
    if (campId != null) return { camp_id: campId };
    return {};
  }, [teamId, campId]);

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await projectApi.listProjects(listParams);
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
  }, [listParams]);

  if (loading) {
    return (
      <div className={sharedStyles.tabContent}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={sharedStyles.tabContent}>
      <ProjectsList
        projects={projects}
        error={error}
        createHref={createHref}
        title="Projects"
        subtitle={
          teamId != null
            ? 'Projects belonging to this team'
            : 'Projects belonging to this camp'
        }
        onProjectRemoved={(guid) =>
          setProjects((prev) => prev.filter((p) => p.guid !== guid))
        }
      />
    </div>
  );
}
