'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import {
  FaArrowLeft,
  FaDesktop,
  FaExclamationTriangle,
  FaFolderOpen,
  FaUsers,
} from 'react-icons/fa';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useMobile } from '@/contexts/MobileContext';
import { useUser } from '@/contexts/UserContext';
import { useAudio } from '@/lib/AudioContext';
import { projectApi } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ProjectDAW } from '@/components/DAW/DAW';
import sharedStyles from '@/styles/Dashboard.module.css';
import styles from './ProjectPage.module.css';

export default function ProjectPage() {
  const router = useRouter();
  const { projectId } = useParams();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const { isAuthenticated, isLoading: userLoading } = useUser();
  const { isMobile } = useMobile();
  const { setSpaceShortcutEnabled } = useAudio();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isMobile || !project) {
      setSpaceShortcutEnabled(true);
      return;
    }
    setSpaceShortcutEnabled(false);
    return () => {
      setSpaceShortcutEnabled(true);
    };
  }, [isMobile, project, setSpaceShortcutEnabled]);

  useEffect(() => {
    if (flagsLoading || userLoading) return;

    if (!isFeatureEnabled('projects', false)) {
      return;
    }

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    if (!projectId) {
      setError('Project not found');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadProject = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await projectApi.getProject(projectId);
        if (!cancelled) {
          setProject(response.data);
        }
      } catch (err) {
        console.error('Error loading project:', err);
        if (!cancelled) {
          if (err.response?.status === 403) {
            setError(
              err.response?.data?.error || 'You do not have access to this project'
            );
          } else if (err.response?.status === 404) {
            setError('Project not found');
          } else {
            setError('Failed to load project');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProject();

    return () => {
      cancelled = true;
    };
  }, [
    flagsLoading,
    userLoading,
    isFeatureEnabled,
    isAuthenticated,
    projectId,
  ]);

  if (flagsLoading || userLoading) {
    return (
      <div className={styles.projectPageContainer}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isFeatureEnabled('projects', false)) {
    notFound();
  }

  if (!isAuthenticated) {
    const redirectPath = `/projects/${projectId}`;

    return (
      <div className={styles.projectPageContainer}>
        <div className={sharedStyles.error}>
          <FaFolderOpen className={sharedStyles.errorIcon} />
          <h1>Authentication Required</h1>
          <p>Please log in to view this project</p>
          <button
            type="button"
            onClick={() =>
              router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`)
            }
            className={sharedStyles.primaryButton}
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.projectPageContainer}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className={styles.projectPageContainer}>
        <div className={sharedStyles.error}>
          <FaExclamationTriangle className={sharedStyles.errorIcon} />
          <h1>{error || 'Project Not Found'}</h1>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className={sharedStyles.primaryButton}
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.projectPageContainer}>
      <Link href="/projects" className={styles.backLink}>
        <FaArrowLeft />
        All Projects
      </Link>

      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerInfo}>
            <FaFolderOpen className={styles.headerIcon} aria-hidden />
            <div>
              <h1 className={styles.title}>{project.name}</h1>
              <div className={styles.meta}>
                {project.role && (
                  <span className={styles.role}>{project.role}</span>
                )}
                <span className={styles.memberCount}>
                  <FaUsers aria-hidden />
                  Members —
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {isMobile ? (
        <div className="mobile-collab-message">
          <FaDesktop className="mobile-collab-icon" />
          <h3>Desktop Required</h3>
          <p>Use Desktop version to record or upload file to collaborate</p>
        </div>
      ) : (
        <div className={styles.dawWorkspace}>
          <ProjectDAW
            project={project}
            isVisible
            onProjectChange={setProject}
          />
        </div>
      )}
    </div>
  );
}
