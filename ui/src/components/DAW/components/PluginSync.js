'use client';

import { useState } from 'react';
import { useDAW } from '../DAWContext';
import { buildStemsObject } from '../misc/DAWUtils';
import { usePluginWebSocket } from '../../../contexts/PluginWebSocketContext';
import { useToast } from '../../../lib/ToastContext';
import ConfirmationDialog from '../../../components/ConfirmationDialog';
import Link from 'next/link';
import styles from '../DAW.module.css';

export default function PluginSync() {
  const { send } = usePluginWebSocket();
  const { showSuccess } = useToast();
  const {trackManagerRef, trackData} = useDAW();
  const [showPluginErrorDialog, setShowPluginErrorDialog] = useState(false);

  const handleSync = async () => {
    if(!trackData || trackData.length === 0) return;

    const stems = buildStemsObject(trackManagerRef.current.getAllTracks(), false);
    const message = {
      type: 'stem_metadata_sync',
      track_id: trackData[0].id,
      payload: { stems }
    }
    try {
      await send(JSON.stringify(message));
      showSuccess('Edits synced to plugin successfully!');
    } catch (err) {
      console.error('Failed to sync edits to plugin:', err);
      setShowPluginErrorDialog(true);
    }
  }

  return (
    <>
      <div className={styles.menuItem} onClick={handleSync}>Sync Edits to Plugin</div>
      <ConfirmationDialog
        isOpen={showPluginErrorDialog}
        onClose={() => setShowPluginErrorDialog(false)}
        onConfirm={() => setShowPluginErrorDialog(false)}
        title="Failed to Sync Edits to Plugin"
        message={
          <>
            Failed to sync edits to plugin. Make sure the plugin is installed and running in a DAW.{' '}
            <Link href="/plugin" className="link-underline" style={{ color: 'var(--seafoam-dark)' }}>Install plugin here</Link>.
          </>
        }
        confirmText="OK"
        variant="default"
      />
    </>
  );
} 