'use client';

import { useState } from 'react';
import { useDAW } from '../DAWContext';
import { buildStemsObject } from '../misc/DAWUtils';
import { usePluginWebSocket } from '../../../contexts/PluginWebSocketContext';
import styles from '../DAW.module.css';

export default function PluginSync({ setShowMenu }) {
  const { send } = usePluginWebSocket();
  const {trackManagerRef, trackData} = useDAW();


  const openInPlugin = async () => {
    if(!trackData || trackData.length === 0) return;
    let msg = {
      type: 'set_track',
      track_id: trackData[0].id,
      payload: trackData[0]
    }
    try {
      await send(JSON.stringify(msg));
    } catch (err) {
    }
    setShowMenu(false);
  };

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
    } catch (err) {
    }
    setShowMenu(false);
  }

  return (
    <>
      <div className={styles.menuItem} onClick={openInPlugin}>Open in Plugin</div>
      <div className={styles.menuItem} onClick={handleSync}>Sync Edits to Plugin</div>
    </>
  );
} 