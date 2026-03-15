'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDAW } from '../DAWContext';
import { buildStemsObject } from '../misc/DAWUtils';
import { usePluginWebSocket } from '../../../contexts/PluginWebSocketContext';

export default function PluginSync() {
  const { status, send } = usePluginWebSocket();
  const {trackManagerRef, trackData} = useDAW();

  const handleSync = () => {
    if(!trackData || trackData.length === 0) return;

    const stems = buildStemsObject(trackManagerRef.current.getAllTracks(), false);
    const message = {
      type: 'stem_metadata_sync',
      track_id: trackData[0].id,
      payload: { stems }
    }
    send(JSON.stringify(message));
  }

  return (
    <div>
      <div onClick={handleSync}>Sync</div>
      <div>{status}</div>
    </div>
  );
} 