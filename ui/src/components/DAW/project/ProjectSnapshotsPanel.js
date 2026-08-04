'use client';

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { projectApi } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { useProjectEditor } from './ProjectEditorContext';
import { hasProjectEditorRole } from './projectEditorConstants';
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
  const {
    isActive,
    projectData,
    isSnapshotPreview,
    snapshotPreviewMeta,
    enterSnapshotPreview,
    exitSnapshotPreview,
    restoreProjectSnapshot,
  } = useProjectEditor();
  const { showToast } = useToast();
  const [label, setLabel] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingSnapshotId, setPendingSnapshotId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const projectGuid = projectData?.guid;
  const canManageSnapshots = hasProjectEditorRole(projectData?.role);
  const canCreateSnapshots = canManageSnapshots && !isSnapshotPreview;

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
    if (!projectGuid || !canCreateSnapshots || isCreating) return;

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

  const handlePreview = async (snapshotId) => {
    if (pendingSnapshotId != null) return;
    setPendingSnapshotId(snapshotId);
    try {
      const ok = await enterSnapshotPreview(snapshotId);
      if (ok) {
        onClose();
      }
    } finally {
      setPendingSnapshotId(null);
    }
  };

  const handleRestore = async (snapshot) => {
    if (pendingSnapshotId != null || !canManageSnapshots) return;

    const labelText = snapshot.label || 'this snapshot';
    const confirmed = window.confirm(
      `Restore “${labelText}”? A pre-restore snapshot of the current project will be saved first.`
    );
    if (!confirmed) return;

    setPendingSnapshotId(snapshot.id);
    try {
      const ok = await restoreProjectSnapshot(snapshot.id);
      if (ok) {
        await loadSnapshots();
        onClose();
      }
    } finally {
      setPendingSnapshotId(null);
    }
  };

  const handleDeleteRequest = (snapshot) => {
    if (pendingSnapshotId != null || !canManageSnapshots) return;
    setDeleteConfirm(snapshot);
  };

  const handleDeleteConfirm = async () => {
    if (!projectGuid || !deleteConfirm || pendingSnapshotId != null) return;

    const snapshot = deleteConfirm;
    const wasPreviewing =
      isSnapshotPreview && snapshotPreviewMeta?.snapshotId === snapshot.id;

    setPendingSnapshotId(snapshot.id);
    try {
      await projectApi.deleteProjectSnapshot(projectGuid, snapshot.id);
      setSnapshots((current) => current.filter((item) => item.id !== snapshot.id));
      setDeleteConfirm(null);
      if (wasPreviewing) {
        await exitSnapshotPreview();
      }
      showToast({ message: 'Snapshot deleted', variant: 'success' });
    } catch (err) {
      const message =
        err.response?.data?.error || 'Failed to delete snapshot. Please try again.';
      showToast({ message, variant: 'error' });
    } finally {
      setPendingSnapshotId(null);
    }
  };

  const handleClose = () => {
    setLabel('');
    setDeleteConfirm(null);
    onClose();
  };

  if (!isActive || !canManageSnapshots || !isOpen) {
    return null;
  }

  return (
    <>
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

          {isSnapshotPreview && (
            <div className={styles.previewNotice}>
              <p>
                Previewing{' '}
                <strong>{snapshotPreviewMeta?.label || 'Untitled snapshot'}</strong>.
                Editing is paused until you exit preview.
              </p>
              <button
                type="button"
                className={`pill-btn ${styles.actionButton}`}
                onClick={() => {
                  void exitSnapshotPreview();
                }}
              >
                Exit preview
              </button>
            </div>
          )}

          {canCreateSnapshots && (
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
          )}

          <div className={styles.listSection}>
            <h3 className={styles.listHeading}>History</h3>
            {isLoading ? (
              <p className={styles.loading}>Loading snapshots…</p>
            ) : snapshots.length === 0 ? (
              <p className={styles.emptyState}>No snapshots yet.</p>
            ) : (
              <ul className={styles.snapshotList}>
                {snapshots.map((snapshot) => {
                  const isPending = pendingSnapshotId === snapshot.id;
                  const isActivePreview =
                    isSnapshotPreview && snapshotPreviewMeta?.snapshotId === snapshot.id;

                  return (
                    <li key={snapshot.id} className={styles.snapshotItem}>
                      <p className={styles.snapshotLabel}>
                        {snapshot.label || 'Untitled snapshot'}
                        {isActivePreview ? (
                          <span className={styles.previewingBadge}>previewing</span>
                        ) : null}
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
                      <div className={styles.snapshotActions}>
                        <button
                          type="button"
                          className={`pill-btn ${styles.actionButton}`}
                          onClick={() => handlePreview(snapshot.id)}
                          disabled={pendingSnapshotId != null}
                        >
                          {isPending && !deleteConfirm && !isActivePreview
                            ? 'Loading…'
                            : 'Preview'}
                        </button>
                        <button
                          type="button"
                          className={`pill-btn gradient-btn ${styles.actionButton}`}
                          onClick={() => handleRestore(snapshot)}
                          disabled={pendingSnapshotId != null}
                        >
                          {isPending && !deleteConfirm ? 'Restoring…' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          className={`pill-btn ${styles.actionButton} ${styles.deleteButton}`}
                          onClick={() => handleDeleteRequest(snapshot)}
                          disabled={pendingSnapshotId != null}
                        >
                          {isPending && deleteConfirm?.id === snapshot.id
                            ? 'Deleting…'
                            : 'Delete'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
        title="Delete snapshot?"
        message={`Delete “${deleteConfirm?.label || 'Untitled snapshot'}”? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        confirmDisabled={pendingSnapshotId != null}
      />
    </>
  );
}
