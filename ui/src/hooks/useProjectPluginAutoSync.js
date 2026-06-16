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

function parsePluginMessageType(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  try {
    return JSON.parse(rawMessage)?.type ?? null;
  } catch {
    return null;
  }
}

/**
 * Debounced project_sync to the local plugin after REST saves (Step 31).
 * Default auto-sync on; manual sync always available via syncToPluginNow.
 */
export function useProjectPluginAutoSync({ projectGuid, canEdit }) {
  const { status, send, subscribeToMessages } = usePluginWebSocket();
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState(() =>
    readProjectPluginAutoSyncEnabled()
  );
  const [isPluginStale, setIsPluginStale] = useState(false);

  const debounceTimerRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const isPluginStaleRef = useRef(false);
  const previousStatusRef = useRef(status);
  const projectGuidRef = useRef(projectGuid);

  useEffect(() => {
    projectGuidRef.current = projectGuid;
  }, [projectGuid]);

  useEffect(() => {
    isPluginStaleRef.current = isPluginStale;
  }, [isPluginStale]);

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

  const runPluginSync = useCallback(
    async ({ silentSuccess = false } = {}) => {
      const guid = projectGuidRef.current;
      if (!guid || !canEdit || syncInFlightRef.current) return false;

      if (status !== 'connected') {
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
    [canEdit, send, status]
  );

  const flushDebouncedSync = useCallback(() => {
    debounceTimerRef.current = null;
    if (!autoSyncEnabled || status !== 'connected') return;
    runPluginSync({ silentSuccess: true });
  }, [autoSyncEnabled, runPluginSync, status]);

  const scheduleDebouncedSync = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(flushDebouncedSync, PLUGIN_AUTO_SYNC_DEBOUNCE_MS);
  }, [flushDebouncedSync]);

  const notifyProjectMutated = useCallback(() => {
    if (!canEdit || !projectGuidRef.current) return;

    markPluginStale();

    if (autoSyncEnabled && status === 'connected') {
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, canEdit, markPluginStale, scheduleDebouncedSync, status]);

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
      const type = parsePluginMessageType(rawMessage);
      if (type === 'project_sync_complete' || type === 'project_load_complete') {
        clearPluginStale();
      }
    });
    return unsubscribe;
  }, [clearPluginStale, subscribeToMessages]);

  useEffect(() => {
    const wasConnected = previousStatusRef.current === 'connected';
    previousStatusRef.current = status;

    if (!wasConnected && status === 'connected' && autoSyncEnabled && isPluginStaleRef.current) {
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, scheduleDebouncedSync, status]);

  useEffect(() => {
    if (autoSyncEnabled && isPluginStaleRef.current && status === 'connected') {
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, scheduleDebouncedSync, status]);

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
