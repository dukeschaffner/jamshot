'use client';

import { createContext, useContext } from 'react';
import { useTrackPluginAutoSync } from '@/hooks/useTrackPluginAutoSync';

const TrackPluginSyncContext = createContext(null);

/**
 * Owns track auto-sync while the Track DAW is mounted (menu may unmount).
 */
export function TrackPluginSyncProvider({ children, enabled = true }) {
  const value = useTrackPluginAutoSync({ enabled });
  return (
    <TrackPluginSyncContext.Provider value={value}>
      {children}
    </TrackPluginSyncContext.Provider>
  );
}

export function useTrackPluginSync() {
  const ctx = useContext(TrackPluginSyncContext);
  if (!ctx) {
    throw new Error('useTrackPluginSync must be used within TrackPluginSyncProvider');
  }
  return ctx;
}
