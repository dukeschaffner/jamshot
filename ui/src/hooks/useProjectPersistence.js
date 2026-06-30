'use client';

import { useCallback, useEffect, useRef } from 'react';
import { projectApi } from '@/lib/api';
import { CLIP_PERSIST_DEBOUNCE_MS } from '@/components/DAW/project/ProjectsConfig';
import { mapProjectSettingsToApiPayload } from '@/components/DAW/project/projectTransportPersistence';
import {
  buildClipOpPayload,
  buildTransportOpPayload,
} from '@/components/DAW/project/projectWsOpPayloads';

/**
 * Debounced persistence for project clip layout and transport settings.
 * Uses WS ops when connected; REST fallback otherwise.
 */
export function useProjectPersistence({
  projectGuid,
  revision,
  applyProjectServerState,
  onRevisionOnlyUpdate,
  showToast,
  onConflictPrompt,
  onRestSaveSuccess,
  sendProjectOp,
  isWsConnected,
  acquireMetadataLock,
  releaseMetadataLock,
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

  const clearAllPending = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    latestEditsRef.current.clear();
    dirtyClipIdsRef.current.clear();

    if (projectSettingsTimerRef.current) {
      clearTimeout(projectSettingsTimerRef.current);
      projectSettingsTimerRef.current = null;
    }
    pendingProjectSettingsRef.current = { fields: {}, revertStates: [] };
    dirtyProjectSettingsRef.current = false;
  }, []);

  const hasPendingLocalEdits = useCallback((exclude = {}) => {
    const { excludeClipId = null, excludeProjectSettings = false } = exclude;

    let hasClips = false;
    if (excludeClipId == null) {
      hasClips =
        dirtyClipIdsRef.current.size > 0 || latestEditsRef.current.size > 0;
    } else {
      hasClips =
        [...dirtyClipIdsRef.current].some((id) => id !== excludeClipId) ||
        [...latestEditsRef.current.keys()].some((id) => id !== excludeClipId);
    }

    const hasSettings =
      !excludeProjectSettings &&
      (dirtyProjectSettingsRef.current ||
        Object.keys(pendingProjectSettingsRef.current.fields).length > 0 ||
        pendingProjectSettingsRef.current.revertStates.length > 0);

    return hasClips || hasSettings;
  }, []);

  const collectRevertStates = useCallback((additional = []) => {
    const revertStates = [...additional];

    for (const pending of latestEditsRef.current.values()) {
      if (pending.revertState) {
        revertStates.push(pending.revertState);
      }
    }

    revertStates.push(...pendingProjectSettingsRef.current.revertStates);
    return revertStates;
  }, []);

  const revertCollectedStates = useCallback((revertStates) => {
    for (let index = revertStates.length - 1; index >= 0; index -= 1) {
      revertStates[index]?.();
    }
  }, []);

  const silentRebase = useCallback(async () => {
    clearAllPending();

    try {
      const projectResponse = await projectApi.getProject(projectGuid);
      revisionRef.current = projectResponse.data.revision;
      applyProjectServerState?.(projectResponse.data);
    } catch {
      showToast?.({
        message: 'Could not reload project. Please refresh the page.',
        variant: 'error',
      });
    }
  }, [applyProjectServerState, clearAllPending, projectGuid, showToast]);

  const handleRevisionConflict = useCallback(
    async ({ revertStates = [], conflictInfo = null, exclude = {} } = {}) => {
      const hasDirty = hasPendingLocalEdits(exclude);
      const allRevertStates = collectRevertStates(revertStates);

      if (!hasDirty) {
        await silentRebase();
        return;
      }

      showToast?.({
        message: 'This project was updated in another tab.',
        variant: 'error',
      });

      const runReload = async () => {
        await silentRebase();
      };

      const runDiscard = () => {
        clearAllPending();
        revertCollectedStates(allRevertStates);

        if (conflictInfo?.currentRevision != null) {
          revisionRef.current = conflictInfo.currentRevision;
          onRevisionOnlyUpdate?.(conflictInfo.currentRevision);
        }
      };

      if (onConflictPrompt) {
        onConflictPrompt({ onReload: runReload, onDiscard: runDiscard });
        return;
      }

      await runReload();
    },
    [
      clearAllPending,
      collectRevertStates,
      hasPendingLocalEdits,
      onConflictPrompt,
      onRevisionOnlyUpdate,
      revertCollectedStates,
      showToast,
      silentRebase,
    ]
  );

  const handleOpFailure = useCallback(
    async ({ result, revertStates, exclude }) => {
      if (result.code === 'REVISION_MISMATCH') {
        await handleRevisionConflict({
          revertStates,
          conflictInfo: {
            currentRevision: result.currentRevision ?? null,
            yourRevision: revisionRef.current,
          },
          exclude,
        });
        return;
      }

      revertCollectedStates(revertStates);
      showToast?.({
        message: result.message || 'Failed to save changes. Please try again.',
        variant: 'error',
      });
    },
    [handleRevisionConflict, revertCollectedStates, showToast]
  );

  const flushProjectSettings = useCallback(async () => {
    projectSettingsTimerRef.current = null;

    const pending = pendingProjectSettingsRef.current;
    const { fields, revertStates } = pending;
    pendingProjectSettingsRef.current = { fields: {}, revertStates: [] };

    if (Object.keys(fields).length === 0 || !projectGuid || revisionRef.current == null) {
      return;
    }

    const useWs = isWsConnected?.() && sendProjectOp;

    if (useWs) {
      const lockAcquired = await acquireMetadataLock?.();
      if (!lockAcquired) {
        revertCollectedStates(revertStates);
        dirtyProjectSettingsRef.current = false;
        showToast?.({
          message: 'Another collaborator is editing project settings.',
          variant: 'error',
        });
        return;
      }

      const opPayload = buildTransportOpPayload(fields);
      const result = await sendProjectOp(opPayload);
      releaseMetadataLock?.();

      if (result.fallbackRest) {
        pendingProjectSettingsRef.current = { fields, revertStates };
        dirtyProjectSettingsRef.current = true;
        projectSettingsTimerRef.current = setTimeout(() => {
          flushProjectSettings();
        }, 0);
        return;
      }

      if (result.ok) {
        revisionRef.current = result.revision;
        dirtyProjectSettingsRef.current = false;
        onRevisionOnlyUpdate?.(result.revision);
        onRestSaveSuccess?.();
        return;
      }

      dirtyProjectSettingsRef.current = false;
      await handleOpFailure({
        result,
        revertStates,
        exclude: { excludeProjectSettings: true },
      });
      return;
    }

    const apiPayload = mapProjectSettingsToApiPayload(fields);
    if (Object.keys(apiPayload).length === 0) {
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
      onRestSaveSuccess?.();
    } catch (err) {
      const status = err.response?.status;
      const message =
        err.response?.data?.error ||
        'Failed to save project settings. Please try again.';

      if (status === 409) {
        await handleRevisionConflict({
          revertStates,
          conflictInfo: {
            currentRevision: err.response?.data?.current_revision ?? null,
            yourRevision: err.response?.data?.your_revision ?? null,
          },
          exclude: { excludeProjectSettings: true },
        });
        return;
      }

      dirtyProjectSettingsRef.current = false;
      revertCollectedStates(revertStates);
      showToast?.({ message, variant: 'error' });
    }
  }, [
    acquireMetadataLock,
    applyProjectServerState,
    handleOpFailure,
    handleRevisionConflict,
    isWsConnected,
    onRestSaveSuccess,
    onRevisionOnlyUpdate,
    projectGuid,
    releaseMetadataLock,
    revertCollectedStates,
    sendProjectOp,
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

      const useWs = isWsConnected?.() && sendProjectOp;

      if (useWs) {
        const opPayload = buildClipOpPayload({
          clipId,
          trackId: pending.trackId,
          sourceTrackId: pending.sourceTrackId,
          patchPayload: pending.payload,
        });

        const result = await sendProjectOp(opPayload);

        if (result.fallbackRest) {
          latestEditsRef.current.set(clipId, pending);
          timersRef.current.set(
            clipId,
            setTimeout(() => {
              flushClipEdit(clipId);
            }, 0)
          );
          return;
        }

        if (result.ok) {
          revisionRef.current = result.revision;
          dirtyClipIdsRef.current.delete(clipId);
          onRevisionOnlyUpdate?.(result.revision);
          onRestSaveSuccess?.();
          return;
        }

        dirtyClipIdsRef.current.delete(clipId);
        await handleOpFailure({
          result,
          revertStates: pending.revertState ? [pending.revertState] : [],
          exclude: { excludeClipId: clipId },
        });
        return;
      }

      try {
        const response = await projectApi.updateProjectClip(projectGuid, clipId, {
          revision: revisionRef.current,
          ...pending.payload,
        });

        revisionRef.current = response.data.revision;
        dirtyClipIdsRef.current.delete(clipId);
        applyProjectServerState?.(response.data);
        onRestSaveSuccess?.();
      } catch (err) {
        const status = err.response?.status;
        const message =
          err.response?.data?.error ||
          'Failed to save clip changes. Please try again.';

        if (status === 409) {
          dirtyClipIdsRef.current.delete(clipId);
          await handleRevisionConflict({
            revertStates: pending.revertState ? [pending.revertState] : [],
            conflictInfo: {
              currentRevision: err.response?.data?.current_revision ?? null,
              yourRevision: err.response?.data?.your_revision ?? null,
            },
            exclude: { excludeClipId: clipId },
          });
          return;
        }

        revertCollectedStates(pending.revertState ? [pending.revertState] : []);
        dirtyClipIdsRef.current.delete(clipId);
        showToast?.({ message, variant: 'error' });
      }
    },
    [
      applyProjectServerState,
      handleOpFailure,
      handleRevisionConflict,
      isWsConnected,
      onRestSaveSuccess,
      onRevisionOnlyUpdate,
      projectGuid,
      revertCollectedStates,
      sendProjectOp,
      showToast,
    ]
  );

  const scheduleClipPersist = useCallback(
    ({ clipId, payload, revertState, trackId, sourceTrackId }) => {
      if (!clipId || !projectGuid || revisionRef.current == null) return;

      dirtyClipIdsRef.current.add(clipId);
      latestEditsRef.current.set(clipId, {
        payload,
        revertState,
        trackId,
        sourceTrackId,
      });

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
    () => hasPendingLocalEdits(),
    [hasPendingLocalEdits]
  );

  return {
    scheduleClipPersist,
    scheduleProjectSettingsPersist,
    hasDirtyEdits,
    handleRevisionConflict,
    clearPendingEdits: clearAllPending,
  };
}
