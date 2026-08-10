'use client';

import PluginAutoSyncMenu from '../pluginSync/PluginAutoSyncMenu';
import { useTrackPluginSync } from '../pluginSync/TrackPluginSyncContext';

export default function PluginSync({ setShowMenu }) {
  const {
    autoSyncEnabled,
    setAutoSyncEnabled,
    isPluginStale,
    syncToPluginNow,
    openTrackInPlugin,
  } = useTrackPluginSync();

  const handleAutoSyncToggle = (event) => {
    setAutoSyncEnabled(event.target.checked);
  };

  const handleOpenInPlugin = async () => {
    await openTrackInPlugin();
    setShowMenu?.(false);
  };

  const handleSyncToPlugin = async () => {
    await syncToPluginNow();
    setShowMenu?.(false);
  };

  return (
    <PluginAutoSyncMenu
      autoSyncEnabled={autoSyncEnabled}
      onAutoSyncToggle={handleAutoSyncToggle}
      onOpenInPlugin={handleOpenInPlugin}
      onSyncToPlugin={handleSyncToPlugin}
      isPluginStale={isPluginStale}
    />
  );
}
