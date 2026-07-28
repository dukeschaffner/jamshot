'use client';

import styles from './ProjectSnapshotPreviewBanner.module.css';
import { getSnapshotPreviewLabel } from './projectSnapshotPreview';

export default function ProjectSnapshotPreviewBanner({
  previewMeta,
  onExit,
  isExiting = false,
}) {
  if (!previewMeta) return null;

  return (
    <div className={styles.banner} role="status">
      <div className={styles.copy}>
        <span className={styles.eyebrow}>Previewing snapshot</span>
        <span className={styles.label}>{getSnapshotPreviewLabel(previewMeta)}</span>
        <span className={styles.hint}>Read-only audition — live project is unchanged</span>
      </div>
      <button
        type="button"
        className={`pill-btn ${styles.exitButton}`}
        onClick={onExit}
        disabled={isExiting}
      >
        {isExiting ? 'Exiting…' : 'Exit preview'}
      </button>
    </div>
  );
}
