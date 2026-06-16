'use client';

import { useProjectEditor } from './ProjectEditorContext';
import styles from '../DAW.module.css';
import pluginStyles from './ProjectPluginSync.module.css';

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

  if (!isActive || !canEdit) {
    return null;
  }

  return (
    <>
      <label className={pluginStyles.autoSyncRow}>
        <input
          type="checkbox"
          className={pluginStyles.autoSyncInput}
          checked={pluginAutoSyncEnabled}
          onChange={handleAutoSyncToggle}
        />
        <span>Auto-sync edits to plugin</span>
      </label>
      <button type="button" className={styles.menuItem} onClick={handleOpenInPlugin}>
        Open in Plugin
      </button>
      {!pluginAutoSyncEnabled ? (
        <button type="button" className={styles.menuItem} onClick={handleSyncToPlugin}>
          Sync edits to plugin
          {isPluginStale ? <span className={pluginStyles.staleBadge}>stale</span> : null}
        </button>
      ) : null}
    </>
  );
}
