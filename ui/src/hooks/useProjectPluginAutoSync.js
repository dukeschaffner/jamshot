'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePluginWebSocket } from '@/contexts/PluginWebSocketContext';
import { PLUGIN_AUTO_SYNC_DEBOUNCE_MS } from '@/components/DAW/project/ProjectsConfig';
import {
  readProjectPluginAutoSyncEnabled,
  writeProjectPluginAutoSyncEnabled,
} from '@/components/DAW/project/projectPluginAutoSyncStorage';
import { fetchProjectPluginPayload } from '@/components/DAW/project/projectPluginSyncApi';
import { buildProjectSyncMessage } from '@/components/DAW/project/projectPluginSyncMessages';
import {
  canAutoSyncProjectToPlugin,
  createInitialPluginSyncGate,
  isMatchingPluginProjectReady,
  reducePluginSyncGate,
} from '@/components/DAW/project/pluginProjectSyncGate';

function parsePluginMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  try {
    return JSON.parse(rawMessage);
  } catch {
    return null;
  }
}

/**
 * Debounced project_sync to the local plugin after REST saves (Step 31).
 * Default auto-sync on; manual sync always available via syncToPluginNow.
 * Auto-sync is gated when the plugin has no matching project loaded.
 * When both sides already have the same project open, plugin_project_status
 * (or a successful probe) enables catch-up sync without "Open in Plugin".
 */
export function useProjectPluginAutoSync({ projectGuid, canEdit }) {
  const { status, send, subscribeToMessages } = usePluginWebSocket();
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState(() =>
    readProjectPluginAutoSyncEnabled()
  );
  const [isPluginStale, setIsPluginStale] = useState(false);
  const [syncGate, setSyncGate] = useState(createInitialPluginSyncGate);

  const debounceTimerRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const isPluginStaleRef = useRef(false);
  const previousStatusRef = useRef(status);
  const projectGuidRef = useRef(projectGuid);
  const syncGateRef = useRef(syncGate);
  const autoSyncEnabledRef = useRef(autoSyncEnabled);
  const catchUpKeyRef = useRef(null);

  useEffect(() => {
    projectGuidRef.current = projectGuid;
  }, [projectGuid]);

  useEffect(() => {
    isPluginStaleRef.current = isPluginStale;
  }, [isPluginStale]);

  useEffect(() => {
    syncGateRef.current = syncGate;
  }, [syncGate]);

  useEffect(() => {
    autoSyncEnabledRef.current = autoSyncEnabled;
  }, [autoSyncEnabled]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const setAutoSyncEnabled = useCallback((enabled) => {
    setAutoSyncEnabledState(enabled);
    writeProjectPluginAutoSyncEnabled(enabled);
  }, []);

  const clearPluginStale = useCallback(() => {
    isPluginStaleRef.current = false;
    setIsPluginStale(false);
  }, []);

  const markPluginStale = useCallback(() => {
    isPluginStaleRef.current = true;
    setIsPluginStale(true);
  }, []);

  const canAutoSync = useCallback(() => {
    return canAutoSyncProjectToPlugin(
      syncGateRef.current,
      projectGuidRef.current,
      status
    );
  }, [status]);

  const runPluginSync = useCallback(
    async ({ silentSuccess = false } = {}) => {
      const guid = projectGuidRef.current;
      if (!guid || !canEdit || syncInFlightRef.current) return false;

      if (status !== 'connected') {
        return false;
      }

      // Auto-sync only when the plugin is known/assumed ready for this project.
      if (silentSuccess && !canAutoSync()) {
        return false;
      }

      syncInFlightRef.current = true;
      try {
        const payload = await fetchProjectPluginPayload(guid);
        const message = buildProjectSyncMessage(guid, payload);
        const sent = await send(JSON.stringify(message), { silentSuccess });
        return sent;
      } catch {
        return false;
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [canAutoSync, canEdit, send, status]
  );

  const flushDebouncedSync = useCallback(() => {
    debounceTimerRef.current = null;
    if (!autoSyncEnabled || !canAutoSync()) return;
    runPluginSync({ silentSuccess: true });
  }, [autoSyncEnabled, canAutoSync, runPluginSync]);

  const scheduleDebouncedSync = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(flushDebouncedSync, PLUGIN_AUTO_SYNC_DEBOUNCE_MS);
  }, [flushDebouncedSync]);

  const notifyProjectMutated = useCallback(() => {
    if (!canEdit || !projectGuidRef.current) return;

    markPluginStale();

    if (autoSyncEnabled && canAutoSync()) {
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, canAutoSync, canEdit, markPluginStale, scheduleDebouncedSync]);

  const syncToPluginNow = useCallback(
    async ({ silentSuccess = false } = {}) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return runPluginSync({ silentSuccess });
    },
    [runPluginSync]
  );

  useEffect(() => {
    const unsubscribe = subscribeToMessages?.((rawMessage) => {
      const parsed = parsePluginMessage(rawMessage);
      if (!parsed?.type) return;

      const nextGate = reducePluginSyncGate(syncGateRef.current, {
        type: parsed.type,
        projectId: parsed.project_id ?? null,
        error: parsed.error ?? null,
      });

      if (nextGate !== syncGateRef.current) {
        syncGateRef.current = nextGate;
        setSyncGate(nextGate);
      }

      if (parsed.type === 'project_sync_complete') {
        if (!parsed.project_id || parsed.project_id === projectGuidRef.current) {
          clearPluginStale();
        }
        return;
      }

      // Matching project became ready in the plugin — start/resume auto-sync.
      const matchingLoadEvent =
        (parsed.type === 'project_load_complete' || parsed.type === 'plugin_project_status') &&
        parsed.project_id === projectGuidRef.current;

      if (matchingLoadEvent && autoSyncEnabledRef.current) {
        scheduleDebouncedSync();
      }
    });
    return unsubscribe;
  }, [clearPluginStale, scheduleDebouncedSync, subscribeToMessages]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (previousStatus === status) return;
    previousStatusRef.current = status;

    const nextGate = reducePluginSyncGate(syncGateRef.current, {
      type: 'connection',
      status,
    });
    if (nextGate !== syncGateRef.current) {
      syncGateRef.current = nextGate;
      setSyncGate(nextGate);
    }

    // New connection: allow catch-up / UNKNOWN probe without requiring a prior edit.
    if (previousStatus !== 'connected' && status === 'connected' && autoSyncEnabled) {
      catchUpKeyRef.current = null;
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, scheduleDebouncedSync, status]);

  // When the gate becomes ready for this project (status announce or load), catch up once.
  useEffect(() => {
    if (!autoSyncEnabled || !canEdit || !projectGuid || status !== 'connected') return;
    if (!canAutoSync()) return;

    const catchUpKey = isMatchingPluginProjectReady(syncGate, projectGuid)
      ? `ready:${projectGuid}`
      : `probe:${projectGuid}`;

    if (catchUpKeyRef.current === catchUpKey) return;
    catchUpKeyRef.current = catchUpKey;
    scheduleDebouncedSync();
  }, [
    autoSyncEnabled,
    canAutoSync,
    canEdit,
    projectGuid,
    scheduleDebouncedSync,
    status,
    syncGate,
  ]);

  return {
    autoSyncEnabled,
    setAutoSyncEnabled,
    isPluginStale,
    clearPluginStale,
    notifyProjectMutated,
    syncToPluginNow,
    pluginStatus: status,
  };
}
