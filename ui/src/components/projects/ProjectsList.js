'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FaFolderOpen, FaArrowRight, FaPlus, FaLock } from 'react-icons/fa';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { projectApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

export default function ProjectsList({
  projects = [],
  error = '',
  onProjectRemoved,
}) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError('');
    try {
      await projectApi.deleteProject(deleteTarget.guid);
      onProjectRemoved?.(deleteTarget.guid);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(
        err.response?.data?.error || 'Failed to delete project'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!leaveTarget) return;
    setBusy(true);
    setActionError('');
    try {
      await projectApi.leaveProject(leaveTarget.guid);
      onProjectRemoved?.(leaveTarget.guid);
      setLeaveTarget(null);
    } catch (err) {
      setActionError(
        err.response?.data?.error || 'Failed to leave project'
      );
    } finally {
      setBusy(false);
    }
  };

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

      {actionError && <p className={styles.errorMessage}>{actionError}</p>}

      <div className={styles.projectsGrid}>
        {projects.map((project) => {
          const contextLabel = getProjectContextLabel(project);
          const isLocked = Boolean(project.accessRevoked);
          const deletionDate = formatDeletionDate(project.scheduledDeletionAt);
          const isOwner = project.role === 'owner';

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

                <div
                  className="project-card-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {isOwner ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${project.name}`}
                            onClick={() => setDeleteTarget(project)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete project</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Project actions for ${project.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setLeaveTarget(project)}
                        >
                          Leave Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {!isLocked && (
                    <div className={styles.projectArrow}>
                      <FaArrowRight />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and all of its tracks,
              clips, and assets. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(leaveTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) setLeaveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {leaveTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to this project until you are invited again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleLeave}
              disabled={busy}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
