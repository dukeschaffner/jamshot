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
import CustomTabs from '@/components/CustomTabs';
import { ProjectDAW } from '@/components/DAW/DAW';
import { ProjectSyncProvider } from '@/components/DAW/project/ProjectSyncContext';
import ProjectPresenceAvatars from '@/components/DAW/project/ProjectPresenceAvatars';
import ProjectMembersTab from '@/components/projects/ProjectMembersTab';
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
  const [activeTab, setActiveTab] = useState('daw');
  const [membersVisited, setMembersVisited] = useState(false);
  const [memberCount, setMemberCount] = useState(null);

  useEffect(() => {
    if (isMobile || !project || activeTab !== 'daw') {
      setSpaceShortcutEnabled(true);
      return;
    }
    setSpaceShortcutEnabled(false);
    return () => {
      setSpaceShortcutEnabled(true);
    };
  }, [isMobile, project, activeTab, setSpaceShortcutEnabled]);

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

  useEffect(() => {
    if (!project?.guid) return;
    let cancelled = false;
    projectApi
      .getMembers(project.guid)
      .then((response) => {
        if (!cancelled) {
          setMemberCount(response.data?.members?.length ?? 0);
        }
      })
      .catch(() => {
        // Member count is optional header metadata
      });
    return () => {
      cancelled = true;
    };
  }, [project?.guid]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    if (tabKey === 'members') {
      setMembersVisited(true);
    }
  };

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

  const tabs = [
    { key: 'daw', label: 'DAW' },
    { key: 'members', label: 'Members' },
  ];

  return (
    <ProjectSyncProvider project={project}>
      <div className={styles.projectPageContainer}>
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <div className={styles.headerLeft}>
              <Link href="/projects" className={styles.backLink}>
                <FaArrowLeft />
                <span className={styles.backLinkLabel}>All Projects</span>
              </Link>
              <span className={styles.headerSep} aria-hidden />
              <FaFolderOpen className={styles.headerIcon} aria-hidden />
              <h1 className={styles.title}>{project.name}</h1>
              <div className={styles.meta}>
                {project.role && (
                  <span className={styles.role}>{project.role}</span>
                )}
                <span className={styles.memberCount}>
                  <FaUsers aria-hidden />
                  Members {memberCount == null ? '—' : memberCount}
                </span>
              </div>
            </div>
            <ProjectPresenceAvatars />
          </div>
        </header>

        <CustomTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          variant="default"
          className={styles.projectTabs}
        />

        {isMobile && activeTab === 'daw' ? (
          <div className="mobile-collab-message">
            <FaDesktop className="mobile-collab-icon" />
            <h3>Desktop Required</h3>
            <p>Use Desktop version to record or upload file to collaborate</p>
          </div>
        ) : (
          <>
            <div
              className={styles.dawWorkspace}
              style={{ display: activeTab === 'daw' ? undefined : 'none' }}
            >
              {!isMobile && (
                <ProjectDAW
                  project={project}
                  isVisible={activeTab === 'daw'}
                  onProjectChange={setProject}
                />
              )}
            </div>

            {(membersVisited || activeTab === 'members') && (
              <div
                className={styles.membersWorkspace}
                style={{ display: activeTab === 'members' ? undefined : 'none' }}
              >
                <ProjectMembersTab
                  projectGuid={project.guid}
                  currentUserRole={project.role}
                  sourceRootId={project.sourceRootId}
                  teamId={project.teamId ?? null}
                  campId={project.campId ?? null}
                  onMemberCountChange={setMemberCount}
                />
              </div>
            )}
          </>
        )}
      </div>
    </ProjectSyncProvider>
  );
}
