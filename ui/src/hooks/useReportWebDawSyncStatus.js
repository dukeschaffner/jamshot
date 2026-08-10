'use client';

import { useEffect, useRef } from 'react';
import { usePluginWebSocket } from '@/contexts/PluginWebSocketContext';
import { buildWebDawSyncStatusMessage } from '@/components/DAW/project/webDawSyncStatusMessages';

/**
 * Ensures a plugin WS connect attempt when a web DAW mounts, and reports
 * Connected / Syncing to the plugin badge from the auto-sync gate.
 *
 * @param {{ syncing: boolean, enabled?: boolean }} options
 *   enabled defaults to true; set false so only one reporter is active
 *   (e.g. project vs track mode).
 */
export function useReportWebDawSyncStatus({ syncing, enabled = true }) {
  const { status, send, connect } = usePluginWebSocket();
  const lastSentRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    // One attempt when entering the web DAW (no polling).
    connect();
  }, [connect, enabled]);

  useEffect(() => {
    if (!enabled) {
      lastSentRef.current = null;
      return undefined;
    }

    if (status !== 'connected') {
      lastSentRef.current = null;
      return undefined;
    }

    const nextSyncing = Boolean(syncing);
    if (lastSentRef.current === nextSyncing) return undefined;

    lastSentRef.current = nextSyncing;
    void send(JSON.stringify(buildWebDawSyncStatusMessage({ syncing: nextSyncing })), {
      silentSuccess: true,
    });

    return () => {
      // Leaving the web DAW while still connected → not syncing.
      if (lastSentRef.current === true) {
        lastSentRef.current = false;
        void send(JSON.stringify(buildWebDawSyncStatusMessage({ syncing: false })), {
          silentSuccess: true,
        });
      }
    };
  }, [send, status, syncing, enabled]);
}
