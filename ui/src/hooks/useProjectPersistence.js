'use client';

import { useCallback, useEffect, useRef } from 'react';
import { projectApi } from '@/lib/api';
import { CLIP_PERSIST_DEBOUNCE_MS } from '@/components/DAW/project/ProjectsConfig';

/**
 * Debounced REST persistence for project clip layout edits (Phase 1).
 * Step 21 adds full 409 conflict UX; dirty clip ids are tracked for that flow.
 */
export function useProjectPersistence({
  projectGuid,
  revision,
  applyProjectServerState,
  showToast,
}) {
  const revisionRef = useRef(revision);
  const dirtyClipIdsRef = useRef(new Set());
  const timersRef = useRef(new Map());
  const latestEditsRef = useRef(new Map());

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  const revertClipEdit = useCallback((revertState) => {
    revertState?.();
  }, []);

  const flushClipEdit = useCallback(
    async (clipId) => {
      const pending = latestEditsRef.current.get(clipId);
      if (!pending || !projectGuid || revisionRef.current == null) return;

      latestEditsRef.current.delete(clipId);
      timersRef.current.delete(clipId);

      try {
        const response = await projectApi.updateProjectClip(projectGuid, clipId, {
          revision: revisionRef.current,
          ...pending.payload,
        });

        revisionRef.current = response.data.revision;
        dirtyClipIdsRef.current.delete(clipId);
        applyProjectServerState?.(response.data);
      } catch (err) {
        const status = err.response?.status;
        const message =
          err.response?.data?.error ||
          'Failed to save clip changes. Please try again.';

        if (status === 409) {
          showToast?.({
            message: 'Project was updated elsewhere. Reloading latest state.',
            variant: 'error',
          });
          dirtyClipIdsRef.current.delete(clipId);
          try {
            const projectResponse = await projectApi.getProject(projectGuid);
            applyProjectServerState?.(projectResponse.data);
          } catch {
            showToast?.({
              message: 'Could not reload project. Please refresh the page.',
              variant: 'error',
            });
          }
          revertClipEdit(pending.revertState);
          return;
        }

        revertClipEdit(pending.revertState);
        dirtyClipIdsRef.current.delete(clipId);
        showToast?.({ message, variant: 'error' });
      }
    },
    [applyProjectServerState, projectGuid, revertClipEdit, showToast]
  );

  const scheduleClipPersist = useCallback(
    ({ clipId, payload, revertState }) => {
      if (!clipId || !projectGuid || revisionRef.current == null) return;

      dirtyClipIdsRef.current.add(clipId);
      latestEditsRef.current.set(clipId, { payload, revertState });

      const existingTimer = timersRef.current.get(clipId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      timersRef.current.set(
        clipId,
        setTimeout(() => {
          flushClipEdit(clipId);
        }, CLIP_PERSIST_DEBOUNCE_MS)
      );
    },
    [flushClipEdit, projectGuid]
  );

  const hasDirtyEdits = useCallback(() => dirtyClipIdsRef.current.size > 0, []);

  return {
    scheduleClipPersist,
    hasDirtyEdits,
  };
}
