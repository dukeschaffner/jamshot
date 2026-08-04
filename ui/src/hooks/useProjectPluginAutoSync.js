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

      // Resume auto-sync once the matching project finishes loading in the plugin.
      if (
        parsed.type === 'project_load_complete' &&
        parsed.project_id === projectGuidRef.current &&
        autoSyncEnabledRef.current &&
        isPluginStaleRef.current
      ) {
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

    const wasConnected = previousStatus === 'connected';
    if (!wasConnected && status === 'connected' && autoSyncEnabled && isPluginStaleRef.current) {
      // UNKNOWN after reconnect: allow a probe if still stale.
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, scheduleDebouncedSync, status]);

  useEffect(() => {
    if (autoSyncEnabled && isPluginStaleRef.current && canAutoSync()) {
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, canAutoSync, scheduleDebouncedSync, syncGate]);

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
