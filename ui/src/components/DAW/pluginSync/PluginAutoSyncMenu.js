'use client';

import styles from '../DAW.module.css';
import pluginStyles from './PluginAutoSyncMenu.module.css';

/**
 * Shared Open / Auto-sync checkbox / Sync edits menu for project + track DAW.
 */
export default function PluginAutoSyncMenu({
  autoSyncEnabled,
  onAutoSyncToggle,
  onOpenInPlugin,
  onSyncToPlugin,
  isPluginStale = false,
  visible = true,
}) {
  if (!visible) {
    return null;
  }

  return (
    <>
      <label className={pluginStyles.autoSyncRow}>
        <input
          type="checkbox"
          className={pluginStyles.autoSyncInput}
          checked={autoSyncEnabled}
          onChange={onAutoSyncToggle}
        />
        <span>Auto-sync edits to plugin</span>
      </label>
      <button type="button" className={styles.menuItem} onClick={onOpenInPlugin}>
        Open in Plugin
      </button>
      {!autoSyncEnabled ? (
        <button type="button" className={styles.menuItem} onClick={onSyncToPlugin}>
          Sync edits to plugin
          {isPluginStale ? <span className={pluginStyles.staleBadge}>stale</span> : null}
        </button>
      ) : null}
    </>
  );
}
