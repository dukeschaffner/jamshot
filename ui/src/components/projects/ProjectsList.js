'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FaFolderOpen, FaArrowRight, FaPlus, FaLock } from 'react-icons/fa';
import { formatDate } from '@/lib/utils';
import sharedStyles from '@/styles/Dashboard.module.css';
import styles from './ProjectsList.module.css';

function getProjectContextLabel(project) {
  if (project.teamName) {
    return `Team: ${project.teamName}`;
  }
  if (project.campName) {
    return `Camp: ${project.campName}`;
  }
  return null;
}

function formatDeletionDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

export default function ProjectsList({ projects = [], error = '' }) {
  const router = useRouter();

  if (error) {
    return (
      <div className={styles.projectsListContainer}>
        <p className={styles.errorMessage}>{error}</p>
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className={sharedStyles.emptyState}>
        <FaFolderOpen className={sharedStyles.emptyIcon} />
        <h3>No Projects Yet</h3>
        <p>Create a project to start arranging clips in the browser DAW.</p>
        <Link href="/projects/create" className={styles.createButton}>
          <FaPlus />
          Create Project
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.projectsListContainer}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerInfo}>
            <FaFolderOpen className={styles.headerIcon} />
            <div>
              <h1 className={styles.title}>Your Projects</h1>
              <p className={styles.subtitle}>
                Personal, team, and camp projects you belong to
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href="/projects/create" className={styles.createButton}>
              <FaPlus />
              Create Project
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.projectsGrid}>
        {projects.map((project) => {
          const contextLabel = getProjectContextLabel(project);
          const isLocked = Boolean(project.accessRevoked);
          const deletionDate = formatDeletionDate(project.scheduledDeletionAt);

          return (
            <div
              key={project.guid}
              className={`${styles.projectCard}${isLocked ? ' project-card-locked' : ''}`}
              onClick={() => {
                if (isLocked) return;
                router.push(`/projects/${project.guid}`);
              }}
              role={isLocked ? undefined : 'button'}
              tabIndex={isLocked ? undefined : 0}
              onKeyDown={(event) => {
                if (isLocked) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  router.push(`/projects/${project.guid}`);
                }
              }}
            >
              <div className={styles.projectCardContent}>
                <div className={styles.projectIcon}>
                  {isLocked ? <FaLock /> : <FaFolderOpen />}
                </div>
                <div className={styles.projectInfo}>
                  {isLocked && <span className="project-locked-badge">Locked</span>}
                  {contextLabel && (
                    <p className={styles.projectContext}>{contextLabel}</p>
                  )}
                  <h3 className={styles.projectName}>{project.name}</h3>
                  <div className={styles.projectMeta}>
                    {project.role && (
                      <span className={styles.projectRole}>{project.role}</span>
                    )}
                    {project.updatedAt && !isLocked && (
                      <span className={styles.projectUpdated}>
                        Updated {formatDate(project.updatedAt)}
                      </span>
                    )}
                  </div>
                  {isLocked && (
                    <p className="project-locked-message">
                      <Link href="/subscribe" onClick={(e) => e.stopPropagation()}>
                        Upgrade to restore
                      </Link>
                      {deletionDate ? ` — deleted on ${deletionDate}` : ''}
                    </p>
                  )}
                </div>
                {!isLocked && (
                  <div className={styles.projectArrow}>
                    <FaArrowRight />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
