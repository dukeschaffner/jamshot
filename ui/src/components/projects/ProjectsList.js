'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FaFolderOpen, FaArrowRight, FaPlus } from 'react-icons/fa';
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

          return (
            <div
              key={project.guid}
              className={styles.projectCard}
              onClick={() => router.push(`/projects/${project.guid}`)}
            >
              <div className={styles.projectCardContent}>
                <div className={styles.projectIcon}>
                  <FaFolderOpen />
                </div>
                <div className={styles.projectInfo}>
                  {contextLabel && (
                    <p className={styles.projectContext}>{contextLabel}</p>
                  )}
                  <h3 className={styles.projectName}>{project.name}</h3>
                  <div className={styles.projectMeta}>
                    {project.role && (
                      <span className={styles.projectRole}>{project.role}</span>
                    )}
                    {project.updatedAt && (
                      <span className={styles.projectUpdated}>
                        Updated {formatDate(project.updatedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.projectArrow}>
                  <FaArrowRight />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
