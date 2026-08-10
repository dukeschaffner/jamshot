'use client';

import { useProjectEditor } from './ProjectEditorContext';
import PluginAutoSyncMenu from '../pluginSync/PluginAutoSyncMenu';

export default function ProjectPluginSync({ setShowMenu }) {
  const {
    isActive,
    canEdit,
    pluginAutoSyncEnabled,
    setPluginAutoSyncEnabled,
    isPluginStale,
    syncProjectToPlugin,
    openProjectInPlugin,
  } = useProjectEditor();

  const handleAutoSyncToggle = (event) => {
    setPluginAutoSyncEnabled(event.target.checked);
  };

  const handleOpenInPlugin = async () => {
    if (!isActive || !canEdit) return;
    await openProjectInPlugin();
    setShowMenu?.(false);
  };

  const handleSyncToPlugin = async () => {
    if (!isActive || !canEdit) return;
    await syncProjectToPlugin();
    setShowMenu?.(false);
  };

  return (
    <PluginAutoSyncMenu
      visible={isActive && canEdit}
      autoSyncEnabled={pluginAutoSyncEnabled}
      onAutoSyncToggle={handleAutoSyncToggle}
      onOpenInPlugin={handleOpenInPlugin}
      onSyncToPlugin={handleSyncToPlugin}
      isPluginStale={isPluginStale}
    />
  );
}
