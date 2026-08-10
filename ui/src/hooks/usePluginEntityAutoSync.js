'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePluginWebSocket } from '@/contexts/PluginWebSocketContext';
import {
  canAutoSyncEntityToPlugin,
  createInitialPluginSyncGate,
  isMatchingPluginEntityReady,
  reducePluginEntitySyncGate,
} from '@/components/DAW/pluginSync/pluginEntitySyncGate';
import {
  readPluginAutoSyncEnabled,
  writePluginAutoSyncEnabled,
} from '@/components/DAW/pluginSync/pluginAutoSyncStorage';
import { useReportWebDawSyncStatus } from '@/hooks/useReportWebDawSyncStatus';

function parsePluginMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  try {
    return JSON.parse(rawMessage);
  } catch {
    return null;
  }
}

/**
 * Shared debounced plugin auto-sync + Syncing badge reporting for project/track.
 *
 * @param {object} options
 * @param {string|number|null|undefined} options.entityId
 * @param {boolean} options.canEdit
 * @param {string} options.storageKey
 * @param {number} options.debounceMs
 * @param {import('@/components/DAW/pluginSync/pluginEntitySyncGate').PluginEntitySyncGateConfig} options.gateConfig
 * @param {(rawMessage: object) => string|null|undefined} options.getEntityIdFromMessage
 * @param {(args: { silentSuccess: boolean }) => Promise<boolean>} options.runSync
 * @param {string} options.syncCompleteType - clears stale when matching
 * @param {boolean} [options.enabled=true] - when false, do not report sync status
 */
export function usePluginEntityAutoSync({
  entityId,
  canEdit,
  storageKey,
  debounceMs,
  gateConfig,
  getEntityIdFromMessage,
  runSync,
  syncCompleteType,
  enabled = true,
}) {
  const { status, subscribeToMessages } = usePluginWebSocket();
  const entityIdField = gateConfig.entityIdField;

  const [autoSyncEnabled, setAutoSyncEnabledState] = useState(() =>
    readPluginAutoSyncEnabled(storageKey)
  );
  const [isPluginStale, setIsPluginStale] = useState(false);
  const [syncGate, setSyncGate] = useState(() =>
    createInitialPluginSyncGate(entityIdField)
  );

  const debounceTimerRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const previousStatusRef = useRef(status);
  const entityIdRef = useRef(entityId);
  const syncGateRef = useRef(syncGate);
  const autoSyncEnabledRef = useRef(autoSyncEnabled);
  const catchUpKeyRef = useRef(null);
  const runSyncRef = useRef(runSync);

  useEffect(() => {
    entityIdRef.current = entityId;
  }, [entityId]);

  useEffect(() => {
    syncGateRef.current = syncGate;
  }, [syncGate]);

  useEffect(() => {
    autoSyncEnabledRef.current = autoSyncEnabled;
  }, [autoSyncEnabled]);

  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const setAutoSyncEnabled = useCallback(
    (enabledValue) => {
      setAutoSyncEnabledState(enabledValue);
      writePluginAutoSyncEnabled(storageKey, enabledValue);
    },
    [storageKey]
  );

  const clearPluginStale = useCallback(() => {
    setIsPluginStale(false);
  }, []);

  const markPluginStale = useCallback(() => {
    setIsPluginStale(true);
  }, []);

  const canAutoSync = useCallback(() => {
    return canAutoSyncEntityToPlugin(
      syncGateRef.current,
      entityIdRef.current,
      status,
      entityIdField
    );
  }, [entityIdField, status]);

  const runPluginSync = useCallback(
    async ({ silentSuccess = false } = {}) => {
      const id = entityIdRef.current;
      if (!id || !canEdit || syncInFlightRef.current) return false;
      if (status !== 'connected') return false;
      if (silentSuccess && !canAutoSync()) return false;

      syncInFlightRef.current = true;
      try {
        return await runSyncRef.current({ silentSuccess });
      } catch {
        return false;
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [canAutoSync, canEdit, status]
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
    debounceTimerRef.current = setTimeout(flushDebouncedSync, debounceMs);
  }, [debounceMs, flushDebouncedSync]);

  const notifyEntityMutated = useCallback(() => {
    if (!canEdit || !entityIdRef.current) return;
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
    if (!enabled) return undefined;

    const unsubscribe = subscribeToMessages?.((rawMessage) => {
      const parsed = parsePluginMessage(rawMessage);
      if (!parsed?.type) return;

      const messageEntityId = getEntityIdFromMessage(parsed) ?? null;
      const nextGate = reducePluginEntitySyncGate(
        syncGateRef.current,
        {
          type: parsed.type,
          entityId: messageEntityId,
          error: parsed.error ?? null,
        },
        gateConfig
      );

      if (nextGate !== syncGateRef.current) {
        syncGateRef.current = nextGate;
        setSyncGate(nextGate);
      }

      if (parsed.type === syncCompleteType) {
        if (!messageEntityId || String(messageEntityId) === String(entityIdRef.current)) {
          clearPluginStale();
        }
        return;
      }

      const matchingLoadEvent =
        (parsed.type === gateConfig.loadCompleteType ||
          parsed.type === gateConfig.statusMessageType) &&
        messageEntityId != null &&
        String(messageEntityId) === String(entityIdRef.current);

      if (matchingLoadEvent && autoSyncEnabledRef.current) {
        scheduleDebouncedSync();
      }
    });
    return unsubscribe;
  }, [
    clearPluginStale,
    enabled,
    gateConfig,
    getEntityIdFromMessage,
    scheduleDebouncedSync,
    subscribeToMessages,
    syncCompleteType,
  ]);

  useEffect(() => {
    if (!enabled) return;

    const previousStatus = previousStatusRef.current;
    if (previousStatus === status) return;
    previousStatusRef.current = status;

    const nextGate = reducePluginEntitySyncGate(
      syncGateRef.current,
      { type: 'connection', status },
      gateConfig
    );
    if (nextGate !== syncGateRef.current) {
      syncGateRef.current = nextGate;
      setSyncGate(nextGate);
    }

    if (previousStatus !== 'connected' && status === 'connected' && autoSyncEnabled) {
      catchUpKeyRef.current = null;
      scheduleDebouncedSync();
    }
  }, [autoSyncEnabled, enabled, gateConfig, scheduleDebouncedSync, status]);

  useEffect(() => {
    if (!enabled || !autoSyncEnabled || !canEdit || !entityId || status !== 'connected') {
      return;
    }
    if (!canAutoSync()) return;

    const catchUpKey = isMatchingPluginEntityReady(syncGate, entityId, entityIdField)
      ? `ready:${entityId}`
      : `probe:${entityId}`;

    if (catchUpKeyRef.current === catchUpKey) return;
    catchUpKeyRef.current = catchUpKey;
    scheduleDebouncedSync();
  }, [
    autoSyncEnabled,
    canAutoSync,
    canEdit,
    enabled,
    entityId,
    entityIdField,
    scheduleDebouncedSync,
    status,
    syncGate,
  ]);

  const reportingSyncing =
    enabled &&
    status === 'connected' &&
    Boolean(canEdit) &&
    Boolean(autoSyncEnabled) &&
    isMatchingPluginEntityReady(syncGate, entityId, entityIdField);

  useReportWebDawSyncStatus({ syncing: reportingSyncing, enabled });

  return {
    autoSyncEnabled,
    setAutoSyncEnabled,
    isPluginStale,
    clearPluginStale,
    notifyEntityMutated,
    syncToPluginNow,
    pluginStatus: status,
  };
}
