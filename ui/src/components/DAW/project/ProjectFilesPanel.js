'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight, faFolderOpen, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ASSET_UNUSED_WARNING_DAYS } from '@sterio/subscription-utils';
import { projectApi } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WaveformWithAudio from '../components/WaveformWithAudio';
import { useProjectEditor } from './ProjectEditorContext';
import { setProjectAssetDragData } from './projectAssetDrag';
import ProjectCollabTracksList from './ProjectCollabTracksList';
import {
  isProjectAccessDeniedError,
  reloadForProjectAccessRevoked,
} from './projectAccessRevoked';
import styles from './ProjectFilesPanel.module.css';

const PANEL_VIEWS = [
  { id: 'library', label: 'Library' },
  { id: 'collabs', label: 'Collabs' },
];

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'On timeline' },
  { id: 'library', label: 'Off timeline' },
  { id: 'processing', label: 'Processing' },
  { id: 'failed', label: 'Failed' },
];

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getUsageLabel(usageStatus) {
  switch (usageStatus) {
    case 'live':
      return 'On timeline';
    case 'soft_deleted_clip':
      return 'Off timeline';
    case 'snapshot_only':
      return 'Snapshot only';
    case 'unused':
      return 'Unused';
    default:
      return usageStatus || 'Unknown';
  }
}

function isCleanupWarning(asset) {
  if (!asset?.lastReferencedAt) return false;
  if (!['unused', 'soft_deleted_clip'].includes(asset.usageStatus)) return false;

  const lastReferenced = new Date(asset.lastReferencedAt).getTime();
  const warningMs = ASSET_UNUSED_WARNING_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - lastReferenced >= warningMs;
}

function matchesFilter(asset, filterId) {
  if (asset.deletedAt) return false;

  switch (filterId) {
    case 'all':
      return true;
    case 'live':
      return asset.usageStatus === 'live';
    case 'library':
      return ['soft_deleted_clip', 'snapshot_only', 'unused'].includes(asset.usageStatus);
    case 'processing':
      return asset.processingStatus === 'pending' || asset.processingStatus === 'processing';
    case 'failed':
      return asset.processingStatus === 'failed';
    default:
      return true;
  }
}

function formatStorageBytes(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return '0 B';
  const value = Number(bytes);
  const gb = value / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
  }
  const mb = value / (1024 * 1024);
  if (mb >= 1) {
    return `${mb % 1 === 0 ? mb : mb.toFixed(1)} MB`;
  }
  const kb = value / 1024;
  if (kb >= 1) {
    return `${Math.round(kb)} KB`;
  }
  return `${Math.round(value)} B`;
}

function ProjectFilesAssetRow({
  asset,
  canEdit,
  onDelete,
  isDeletePending,
}) {
  const rowRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '80px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isDraggable =
    canEdit &&
    asset.processingStatus === 'completed' &&
    asset.durationSeconds != null;

  const handleDragStart = (event) => {
    if (!isDraggable) {
      event.preventDefault();
      return;
    }
    setProjectAssetDragData(event.dataTransfer, asset);
  };

  const showWarning = isCleanupWarning(asset);

  return (
    <li ref={rowRef}>
      <Card
        className={`${styles.assetItem} ${isDraggable ? styles.draggable : ''}`}
        draggable={isDraggable}
        onDragStart={handleDragStart}
      >
        <CardContent className={styles.assetCardContent}>
      <div className={styles.assetHeader}>
        <p className={styles.assetName}>
          {asset.name || 'Untitled'}
        </p>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.deleteButton}
            onClick={() => onDelete(asset)}
            disabled={isDeletePending}
            aria-label={`Delete ${asset.name || 'asset'}`}
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        )}
      </div>

      <div className={styles.assetMeta}>
        <span>{formatDuration(asset.durationSeconds)}</span>
        {asset.fileSizeBytes != null && (
          <span>{formatFileSize(asset.fileSizeBytes)}</span>
        )}
        <Badge variant="outline">{getUsageLabel(asset.usageStatus)}</Badge>
        {showWarning && (
          <Badge variant="destructive">Cleanup soon</Badge>
        )}
      </div>

      {asset.processingStatus === 'completed' && isVisible && asset.waveformUrl ? (
        <WaveformWithAudio
          audioUrl={asset.audioUrl}
          waveformUrl={asset.waveformUrl}
          durationSeconds={asset.durationSeconds}
          height={36}
        />
      ) : asset.processingStatus === 'pending' || asset.processingStatus === 'processing' ? (
        <p className={styles.statusText}>Processing…</p>
      ) : asset.processingStatus === 'failed' ? (
        <p className={styles.statusTextError}>
          {asset.processingError || 'Processing failed'}
        </p>
      ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

export default function ProjectFilesPanel() {
  const {
    isActive,
    canEdit,
    projectData,
    deleteProjectAsset,
  } = useProjectEditor();
  const { showToast } = useToast();

  const [assets, setAssets] = useState([]);
  const [storage, setStorage] = useState(null);
  const [panelView, setPanelView] = useState('library');
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [deletePendingId, setDeletePendingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const projectGuid = projectData?.guid;
  const revision = projectData?.revision;
  const hasCollabTree = projectData?.sourceRootId != null;

  useEffect(() => {
    if (!hasCollabTree && panelView === 'collabs') {
      setPanelView('library');
    }
  }, [hasCollabTree, panelView]);

  const loadAssets = useCallback(async () => {
    if (!projectGuid) return;

    setIsLoading(true);
    try {
      const response = await projectApi.listProjectAssets(projectGuid);
      setAssets(response.data.assets ?? []);
      setStorage(response.data.storage ?? null);
    } catch (err) {
      if (isProjectAccessDeniedError(err)) {
        reloadForProjectAccessRevoked();
        return;
      }
      const message =
        err.response?.data?.error || 'Failed to load project files. Please try again.';
      showToast({ message, variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [projectGuid, showToast]);

  useEffect(() => {
    if (!isActive || !projectGuid) return;
    loadAssets();
  }, [isActive, projectGuid, revision, loadAssets]);

  const filteredAssets = useMemo(
    () => assets.filter((asset) => matchesFilter(asset, filter)),
    [assets, filter]
  );

  const hasProcessingAssets = useMemo(
    () =>
      assets.some(
        (asset) =>
          !asset.deletedAt &&
          (asset.processingStatus === 'pending' || asset.processingStatus === 'processing')
      ),
    [assets]
  );

  useEffect(() => {
    if (!hasProcessingAssets) return;

    const interval = setInterval(loadAssets, 3000);
    return () => clearInterval(interval);
  }, [hasProcessingAssets, loadAssets]);

  const performDelete = useCallback(
    async (asset, confirm = false) => {
      setDeletePendingId(asset.id);
      try {
        const result = await deleteProjectAsset(asset.id, { confirm });
        if (result.ok) {
          setAssets((current) => current.filter((item) => item.id !== asset.id));
          showToast({ message: 'File deleted', variant: 'success' });
          setDeleteConfirm(null);
          return;
        }

        if (result.requiresConfirm) {
          setDeleteConfirm({
            asset,
            message: result.message,
          });
        }
      } finally {
        setDeletePendingId(null);
      }
    },
    [deleteProjectAsset, showToast]
  );

  const handleDeleteRequest = useCallback(
    (asset) => {
      if (!canEdit) return;

      const isUsedInProject =
        asset.usageStatus === 'live' || Number(asset.liveClipCount) > 0;

      if (isUsedInProject) {
        setDeleteConfirm({
          asset,
          message:
            'This file is currently used in this project. Are you sure you want to delete it?',
        });
        return;
      }

      if (asset.snapshotReferenced) {
        setDeleteConfirm({
          asset,
          message:
            'This file is referenced by a snapshot. Deleting it may affect snapshot restore. Continue?',
        });
        return;
      }

      setDeleteConfirm({
        asset,
        message: `Are you sure you want to delete "${asset.name || 'this file'}"?`,
      });
    },
    [canEdit]
  );

  if (!isActive) {
    return null;
  }

  if (isCollapsed) {
    return (
      <aside className={`${styles.panel} ${styles.collapsedPanel}`} aria-label="Project files collapsed">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={styles.collapseButton}
          onClick={() => setIsCollapsed(false)}
          aria-label="Expand project files"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </Button>
        <FontAwesomeIcon className={styles.collapsedIcon} icon={faFolderOpen} aria-hidden />
        <span className={styles.collapsedLabel}>Files</span>
      </aside>
    );
  }

  return (
    <>
      <aside className={styles.panel} aria-label="Project files">
        <div className={styles.header}>
          <h2 className={styles.title}>Files</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.collapseButton}
            onClick={() => setIsCollapsed(true)}
            aria-label="Collapse project files"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </Button>
        </div>

        {storage && storage.maxBytes != null && storage.maxBytes !== -1 && panelView === 'library' && (
          <div className="project-storage-usage">
            <div>
              {formatStorageBytes(storage.usedBytes)} / {formatStorageBytes(storage.maxBytes)} used
            </div>
            <div className="project-storage-usage-bar" aria-hidden>
              <div
                className={`project-storage-usage-bar-fill${
                  storage.usedBytes / storage.maxBytes >= 0.9 ? ' near-limit' : ''
                }`}
                style={{
                  width: `${Math.min(100, (storage.usedBytes / storage.maxBytes) * 100)}%`,
                }}
              />
            </div>
            {storage.usedBytes / storage.maxBytes >= 0.9 && (
              <a className="project-storage-upgrade-link" href="/subscribe">
                Upgrade for more storage
              </a>
            )}
          </div>
        )}

        {hasCollabTree && (
          <Tabs value={panelView} onValueChange={setPanelView} className={styles.filters}>
            <TabsList className={styles.filterList}>
              {PANEL_VIEWS.map((option) => (
                <TabsTrigger key={option.id} value={option.id}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {panelView === 'library' && (
          <Tabs value={filter} onValueChange={setFilter} className={styles.filters}>
            <TabsList className={styles.filterList}>
              {FILTER_OPTIONS.map((option) => (
                <TabsTrigger key={option.id} value={option.id}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <ScrollArea className={styles.listSection}>
          <div className={styles.listSectionInner}>
            {panelView === 'collabs' && hasCollabTree ? (
              <ProjectCollabTracksList projectGuid={projectGuid} canEdit={canEdit} />
            ) : isLoading && assets.length === 0 ? (
              <p className={styles.emptyState}>Loading files…</p>
            ) : filteredAssets.length === 0 ? (
              <p className={styles.emptyState}>No files match this filter.</p>
            ) : (
              <ul className={styles.assetList}>
                {filteredAssets.map((asset) => (
                  <ProjectFilesAssetRow
                    key={asset.id}
                    asset={asset}
                    canEdit={canEdit}
                    onDelete={handleDeleteRequest}
                    isDeletePending={deletePendingId === asset.id}
                  />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        {canEdit && (
          <p className={styles.hint}>
            {panelView === 'collabs'
              ? 'Drag a collab stem onto a track to add it to the project.'
              : 'Drag a file onto a track to place it on the timeline.'}
          </p>
        )}
      </aside>

      <ConfirmationDialog
        isOpen={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => performDelete(deleteConfirm.asset, true)}
        title="Delete file?"
        message={deleteConfirm?.message}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        confirmDisabled={deletePendingId != null}
      />
    </>
  );
}
