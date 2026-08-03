'use client';

import { useCallback, useEffect, useRef } from 'react';
import { projectApi } from '@/lib/api';
import { CLIP_PERSIST_DEBOUNCE_MS } from '@/components/DAW/project/ProjectsConfig';

/**
 * Debounced per-track gain persistence via WS track.update (REST fallback).
 */
export function useProjectTrackGainPersistence({
  projectGuid,
  revision,
  applyProjectServerState,
  onWsOpSuccess,
  onRevisionOnlyUpdate,
  showToast,
  handleRevisionConflict,
  onRestSaveSuccess,
  sendProjectOp,
  isWsConnected,
}) {
  const revisionRef = useRef(revision);
  const timersRef = useRef(new Map());
  const pendingGainsRef = useRef(new Map());

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
      pendingGainsRef.current.clear();
    };
  }, []);

  const flushTrackGain = useCallback(
    async (trackId) => {
      const pending = pendingGainsRef.current.get(trackId);
      if (pending == null || !projectGuid || revisionRef.current == null) return;

      pendingGainsRef.current.delete(trackId);
      timersRef.current.delete(trackId);

      const gain = pending;
      const useWs = isWsConnected?.() && sendProjectOp;

      if (useWs) {
        const result = await sendProjectOp({
          kind: 'track.update',
          trackId,
          gain,
        });

        if (result.fallbackRest) {
          pendingGainsRef.current.set(trackId, gain);
          timersRef.current.set(
            trackId,
            setTimeout(() => {
              flushTrackGain(trackId);
            }, 0)
          );
          return;
        }

        if (result.ok) {
          revisionRef.current = result.revision;
          if (onWsOpSuccess) {
            onWsOpSuccess(result);
          } else {
            onRevisionOnlyUpdate?.(result.revision);
          }
          onRestSaveSuccess?.();
          return;
        }

        if (result.code === 'REVISION_MISMATCH') {
          await handleRevisionConflict?.({
            conflictInfo: {
              currentRevision: result.currentRevision ?? null,
              yourRevision: revisionRef.current,
            },
          });
          return;
        }

        showToast?.({
          message: result.message || 'Failed to save track gain. Please try again.',
          variant: 'error',
        });
        return;
      }

      try {
        const response = await projectApi.updateProjectTrack(projectGuid, trackId, {
          revision: revisionRef.current,
          gain,
        });
        revisionRef.current = response.data.revision;
        applyProjectServerState?.(response.data);
        onRestSaveSuccess?.();
      } catch (err) {
        const status = err.response?.status;
        const message =
          err.response?.data?.error || 'Failed to save track gain. Please try again.';

        if (status === 409) {
          await handleRevisionConflict?.({
            conflictInfo: {
              currentRevision: err.response?.data?.current_revision ?? null,
              yourRevision: err.response?.data?.your_revision ?? null,
            },
          });
          return;
        }

        showToast?.({ message, variant: 'error' });
      }
    },
    [
      applyProjectServerState,
      handleRevisionConflict,
      isWsConnected,
      onRestSaveSuccess,
      onRevisionOnlyUpdate,
      onWsOpSuccess,
      projectGuid,
      sendProjectOp,
      showToast,
    ]
  );

  const scheduleTrackGainPersist = useCallback(
    (trackId, gain) => {
      if (trackId == null || !projectGuid || revisionRef.current == null) return;
      if (typeof gain !== 'number' || !Number.isFinite(gain)) return;

      pendingGainsRef.current.set(trackId, gain);

      const existingTimer = timersRef.current.get(trackId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      timersRef.current.set(
        trackId,
        setTimeout(() => {
          flushTrackGain(trackId);
        }, CLIP_PERSIST_DEBOUNCE_MS)
      );
    },
    [flushTrackGain, projectGuid]
  );

  return { scheduleTrackGainPersist };
}
