'use client';

import { useCallback, useEffect } from 'react';
import { usePluginWebSocket } from '@/contexts/PluginWebSocketContext';
import { useDAW } from '@/components/DAW/DAWContext';
import { buildStemsObject } from '@/components/DAW/misc/DAWUtils';
import { eventBus } from '@/components/DAW/misc/EventBus';
import { DAW_EVENTS } from '@/components/DAW/misc/DAWEvents';
import DAWConfig from '@/components/DAW/misc/DAWConfig';
import { TRACK_SYNC_GATE_CONFIG } from '@/components/DAW/pluginSync/pluginEntitySyncGate';
import { usePluginEntityAutoSync } from '@/hooks/usePluginEntityAutoSync';

/**
 * Debounced stem_metadata_sync after local Track DAW edits.
 * Default auto-sync on; gated when the plugin has no matching track loaded.
 */
export function useTrackPluginAutoSync({ enabled = true } = {}) {
  const { send } = usePluginWebSocket();
  const { trackManagerRef, trackData, dawMode } = useDAW();

  const isTrackMode = dawMode !== 'project';
  const active = enabled && isTrackMode;
  const trackId = trackData?.[0]?.id ?? null;

  const runSync = useCallback(
    async ({ silentSuccess = false } = {}) => {
      if (!trackId || !trackManagerRef.current) return false;
      const stems = buildStemsObject(trackManagerRef.current.getAllTracks(), false);
      const message = {
        type: 'stem_metadata_sync',
        track_id: trackId,
        payload: { stems },
      };
      return send(JSON.stringify(message), { silentSuccess });
    },
    [send, trackId, trackManagerRef]
  );

  const getEntityIdFromMessage = useCallback((parsed) => {
    if (parsed.track_id == null) return null;
    return String(parsed.track_id);
  }, []);

  const {
    autoSyncEnabled,
    setAutoSyncEnabled,
    isPluginStale,
    clearPluginStale,
    notifyEntityMutated,
    syncToPluginNow,
    pluginStatus,
  } = usePluginEntityAutoSync({
    entityId: trackId != null ? String(trackId) : null,
    canEdit: active && Boolean(trackId),
    storageKey: DAWConfig.plugin.trackAutoSyncStorageKey,
    debounceMs: DAWConfig.plugin.autoSyncDebounceMs,
    gateConfig: TRACK_SYNC_GATE_CONFIG,
    getEntityIdFromMessage,
    runSync,
    syncCompleteType: TRACK_SYNC_GATE_CONFIG.syncCompleteType,
    enabled: active,
  });

  const openTrackInPlugin = useCallback(async () => {
    if (!trackData || trackData.length === 0) return false;
    const message = {
      type: 'set_track',
      track_id: trackData[0].id,
      payload: trackData[0],
    };
    return send(JSON.stringify(message));
  }, [send, trackData]);

  // Local Track DAW edits → notify auto-sync (no REST save loop like projects).
  useEffect(() => {
    if (!active) return undefined;

    const onMutated = () => {
      notifyEntityMutated();
    };

    const subscriptions = [
      [DAW_EVENTS.REGION.ADDED, eventBus.on(DAW_EVENTS.REGION.ADDED, onMutated)],
      [DAW_EVENTS.REGION.UPDATED, eventBus.on(DAW_EVENTS.REGION.UPDATED, onMutated)],
      [DAW_EVENTS.REGION.REMOVED, eventBus.on(DAW_EVENTS.REGION.REMOVED, onMutated)],
      [DAW_EVENTS.TRACK.VOLUME_CHANGE, eventBus.on(DAW_EVENTS.TRACK.VOLUME_CHANGE, onMutated)],
    ];

    return () => {
      subscriptions.forEach(([event, id]) => eventBus.off(event, id));
    };
  }, [active, notifyEntityMutated]);

  return {
    autoSyncEnabled,
    setAutoSyncEnabled,
    isPluginStale,
    clearPluginStale,
    notifyTrackMutated: notifyEntityMutated,
    syncToPluginNow,
    openTrackInPlugin,
    pluginStatus,
  };
}
