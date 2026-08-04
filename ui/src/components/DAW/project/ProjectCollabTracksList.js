'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { projectApi } from '@/lib/api';
import { useToast } from '@/lib/ToastContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import WaveformWithAudio from '../components/WaveformWithAudio';
import { setCollabTrackDragData, clearCollabTrackDrag } from './projectCollabTrackDrag';
import styles from './ProjectFilesPanel.module.css';

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function CollabTrackRow({ track, canEdit }) {
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

  const isDraggable = Boolean(
    canEdit && track.durationSeconds != null && track.audioUrl
  );

  const handleDragStart = (event) => {
    if (!isDraggable) {
      event.preventDefault();
      return;
    }
    setCollabTrackDragData(event.dataTransfer, track);
  };

  const handleDragEnd = () => {
    clearCollabTrackDrag();
  };

  return (
    <li ref={rowRef}>
      <Card
        className={`${styles.assetItem} ${isDraggable ? styles.draggable : ''}`}
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <CardContent className={styles.assetCardContent}>
          <div className={styles.assetHeader}>
            <p className={styles.assetName}>{track.title || 'Untitled'}</p>
          </div>

          <div className={styles.assetMeta}>
            <span>{formatDuration(track.durationSeconds)}</span>
            {track.username && <Badge variant="outline">@{track.username}</Badge>}
            {track.layer != null && (
              <Badge variant="secondary">Layer {track.layer}</Badge>
            )}
          </div>

          {isVisible && track.audioUrl ? (
            <WaveformWithAudio
              audioUrl={track.audioUrl}
              waveformUrl={track.waveformUrl}
              durationSeconds={track.durationSeconds}
              height={36}
            />
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

/**
 * Infinite-scroll list of collab-tree stems for projects created from a track.
 */
export default function ProjectCollabTracksList({ projectGuid, canEdit }) {
  const { showToast } = useToast();
  const [tracks, setTracks] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const loadMoreRef = useRef(null);
  const loadingRef = useRef(false);

  const loadPage = useCallback(
    async ({ cursor = null, append = false } = {}) => {
      if (!projectGuid || loadingRef.current) return;
      loadingRef.current = true;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await projectApi.getProjectCollabTracks(projectGuid, {
          cursor,
          limit: 20,
        });
        const page = response.data?.tracks ?? [];
        setTracks((current) => (append ? [...current, ...page] : page));
        setNextCursor(response.data?.nextCursor ?? null);
        setHasLoaded(true);
      } catch (err) {
        const message =
          err.response?.data?.error || 'Failed to load collab tracks. Please try again.';
        showToast({ message, variant: 'error' });
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [projectGuid, showToast]
  );

  useEffect(() => {
    setTracks([]);
    setNextCursor(null);
    setHasLoaded(false);
    loadPage({ append: false });
  }, [loadPage]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || nextCursor == null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && nextCursor != null && !loadingRef.current) {
          loadPage({ cursor: nextCursor, append: true });
        }
      },
      { rootMargin: '120px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadPage, nextCursor]);

  if (isLoading && !hasLoaded) {
    return (
      <div className={styles.assetList} style={{ display: 'grid', gap: 8, padding: 8 }}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (hasLoaded && tracks.length === 0) {
    return <p className={styles.emptyState}>No collab tracks found in this tree.</p>;
  }

  return (
    <>
      <ul className={styles.assetList}>
        {tracks.map((track) => (
          <CollabTrackRow key={track.trackId} track={track} canEdit={canEdit} />
        ))}
      </ul>
      <div ref={loadMoreRef} aria-hidden style={{ height: 1 }} />
      {isLoadingMore && <p className={styles.emptyState}>Loading more…</p>}
    </>
  );
}
