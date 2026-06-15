'use client';

import { useCallback, useEffect, useRef } from 'react';
import { projectApi } from '@/lib/api';
import { CLIP_PERSIST_DEBOUNCE_MS } from '@/components/DAW/project/ProjectsConfig';
import { mapProjectSettingsToApiPayload } from '@/components/DAW/project/projectTransportPersistence';

/**
 * Debounced REST persistence for project clip layout and transport settings (Phase 1).
 * Step 21 adds full 409 conflict UX; dirty fields are tracked for that flow.
 */
export function useProjectPersistence({
  projectGuid,
  revision,
  applyProjectServerState,
  showToast,
}) {
  const revisionRef = useRef(revision);
  const dirtyClipIdsRef = useRef(new Set());
  const dirtyProjectSettingsRef = useRef(false);
  const timersRef = useRef(new Map());
  const latestEditsRef = useRef(new Map());
  const pendingProjectSettingsRef = useRef({ fields: {}, revertStates: [] });
  const projectSettingsTimerRef = useRef(null);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
      if (projectSettingsTimerRef.current) {
        clearTimeout(projectSettingsTimerRef.current);
      }
    };
  }, []);

  const revertClipEdit = useCallback((revertState) => {
    revertState?.();
  }, []);

  const revertProjectSettings = useCallback((revertStates) => {
    for (let index = revertStates.length - 1; index >= 0; index -= 1) {
      revertStates[index]?.();
    }
  }, []);

  const handleRevisionConflict = useCallback(
    async (revertState) => {
      showToast?.({
        message: 'Project was updated elsewhere. Reloading latest state.',
        variant: 'error',
      });

      try {
        const projectResponse = await projectApi.getProject(projectGuid);
        applyProjectServerState?.(projectResponse.data);
      } catch {
        showToast?.({
          message: 'Could not reload project. Please refresh the page.',
          variant: 'error',
        });
      }

      revertState?.();
    },
    [applyProjectServerState, projectGuid, showToast]
  );

  const flushProjectSettings = useCallback(async () => {
    projectSettingsTimerRef.current = null;

    const pending = pendingProjectSettingsRef.current;
    const { fields, revertStates } = pending;
    pendingProjectSettingsRef.current = { fields: {}, revertStates: [] };

    const apiPayload = mapProjectSettingsToApiPayload(fields);
    if (Object.keys(apiPayload).length === 0 || !projectGuid || revisionRef.current == null) {
      return;
    }

    try {
      const response = await projectApi.updateProject(projectGuid, {
        revision: revisionRef.current,
        ...apiPayload,
      });

      revisionRef.current = response.data.revision;
      dirtyProjectSettingsRef.current = false;
      applyProjectServerState?.(response.data);
    } catch (err) {
      const status = err.response?.status;
      const message =
        err.response?.data?.error ||
        'Failed to save project settings. Please try again.';

      dirtyProjectSettingsRef.current = false;

      if (status === 409) {
        await handleRevisionConflict(() => revertProjectSettings(revertStates));
        return;
      }

      revertProjectSettings(revertStates);
      showToast?.({ message, variant: 'error' });
    }
  }, [
    applyProjectServerState,
    handleRevisionConflict,
    projectGuid,
    revertProjectSettings,
    showToast,
  ]);

  const scheduleProjectSettingsPersist = useCallback(
    ({ fields, revertState }) => {
      if (!projectGuid || revisionRef.current == null) return;

      const pending = pendingProjectSettingsRef.current;
      Object.assign(pending.fields, fields);
      if (revertState) {
        pending.revertStates.push(revertState);
      }

      dirtyProjectSettingsRef.current = true;

      if (projectSettingsTimerRef.current) {
        clearTimeout(projectSettingsTimerRef.current);
      }

      projectSettingsTimerRef.current = setTimeout(() => {
        flushProjectSettings();
      }, CLIP_PERSIST_DEBOUNCE_MS);
    },
    [flushProjectSettings, projectGuid]
  );

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
          dirtyClipIdsRef.current.delete(clipId);
          await handleRevisionConflict(pending.revertState);
          return;
        }

        revertClipEdit(pending.revertState);
        dirtyClipIdsRef.current.delete(clipId);
        showToast?.({ message, variant: 'error' });
      }
    },
    [
      applyProjectServerState,
      handleRevisionConflict,
      projectGuid,
      revertClipEdit,
      showToast,
    ]
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

  const hasDirtyEdits = useCallback(
    () => dirtyClipIdsRef.current.size > 0 || dirtyProjectSettingsRef.current,
    []
  );

  return {
    scheduleClipPersist,
    scheduleProjectSettingsPersist,
    hasDirtyEdits,
  };
}
