'use client';

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { projectApi } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';
import { useProjectEditor } from './ProjectEditorContext';
import styles from './ProjectSnapshotsPanel.module.css';

function formatSnapshotTimestamp(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSnapshotKind(kind) {
  if (kind === 'pre_restore') return 'pre-restore';
  return kind || 'manual';
}

export default function ProjectSnapshotsPanel({ isOpen, onClose }) {
  const { isActive, canEdit, projectData } = useProjectEditor();
  const { showToast } = useToast();
  const [label, setLabel] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const projectGuid = projectData?.guid;

  const loadSnapshots = useCallback(async () => {
    if (!projectGuid) return;

    setIsLoading(true);
    try {
      const response = await projectApi.listProjectSnapshots(projectGuid);
      setSnapshots(response.data.snapshots ?? []);
    } catch (err) {
      const message =
        err.response?.data?.error || 'Failed to load snapshots. Please try again.';
      showToast({ message, variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [projectGuid, showToast]);

  useEffect(() => {
    if (!isOpen || !projectGuid) return;
    loadSnapshots();
  }, [isOpen, projectGuid, loadSnapshots]);

  const handleCreate = async () => {
    if (!projectGuid || !canEdit || isCreating) return;

    setIsCreating(true);
    try {
      const response = await projectApi.createProjectSnapshot(projectGuid, {
        label: label.trim() || undefined,
      });
      setSnapshots((current) => [response.data, ...current]);
      setLabel('');
      showToast({ message: 'Snapshot saved', variant: 'success' });
    } catch (err) {
      const message =
        err.response?.data?.error || 'Failed to create snapshot. Please try again.';
      showToast({ message, variant: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setLabel('');
    onClose();
  };

  if (!isActive || !canEdit || !isOpen) {
    return null;
  }

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className={styles.panel} role="dialog" aria-labelledby="project-snapshots-title">
            <div className={styles.header}>
              <h2 id="project-snapshots-title" className={styles.title}>
                Snapshots
              </h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={handleClose}
                aria-label="Close snapshots"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className={styles.createSection}>
              <input
                type="text"
                className={styles.labelInput}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Optional label (e.g. Before vocal take)"
                maxLength={200}
                disabled={isCreating}
              />
              <button
                type="button"
                className={`pill-btn gradient-btn ${styles.createButton}`}
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? 'Saving…' : 'Save snapshot'}
              </button>
            </div>

            <div className={styles.listSection}>
              <h3 className={styles.listHeading}>History</h3>
              {isLoading ? (
                <p className={styles.loading}>Loading snapshots…</p>
              ) : snapshots.length === 0 ? (
                <p className={styles.emptyState}>No snapshots yet.</p>
              ) : (
                <ul className={styles.snapshotList}>
                  {snapshots.map((snapshot) => (
                    <li key={snapshot.id} className={styles.snapshotItem}>
                      <p className={styles.snapshotLabel}>
                        {snapshot.label || 'Untitled snapshot'}
                      </p>
                      <p className={styles.snapshotMeta}>
                        {formatSnapshotTimestamp(snapshot.createdAt)}
                        {snapshot.createdBy?.username
                          ? ` · ${snapshot.createdBy.username}`
                          : ''}
                        <span className={styles.kindBadge}>
                          {formatSnapshotKind(snapshot.snapshotKind)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
  );
}
