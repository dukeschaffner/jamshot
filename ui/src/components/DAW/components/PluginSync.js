'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDAW } from '../DAWContext';
import { buildStemsObject } from '../misc/DAWUtils';


const WS_URL = 'ws://localhost:8080'


function useWebSocket(url) {
  const ws = useRef(null)
  const [status, setStatus] = useState('disconnected')
  const [log, setLog] = useState([])

  const addLog = useCallback((text, type = 'system') => {
    setLog(prev => [...prev, { text, type, id: Date.now() + Math.random() }])
  }, [])

  const connect = useCallback(() => {
    if (ws.current) return
    setStatus('connecting')
    addLog('Connecting to ' + url)
    ws.current = new WebSocket(url)

    ws.current.onopen    = () => { setStatus('connected');    addLog('Connected') }
    ws.current.onclose   = () => { setStatus('disconnected'); addLog('Disconnected'); ws.current = null }
    ws.current.onerror   = () => { setStatus('error');        addLog('Connection error') }
    ws.current.onmessage = (e) => addLog(e.data, 'incoming')
  }, [url, addLog])

  const disconnect = useCallback(() => ws.current?.close(), [])

  const send = useCallback((msg) => {
    if (!msg.trim() || ws.current?.readyState !== WebSocket.OPEN) return false
    ws.current.send(msg)
    addLog(msg, 'outgoing')
    return true
  }, [addLog])

  useEffect(() => { connect(); return () => disconnect() }, [connect, disconnect])

  return { status, log, connect, disconnect, send }
}

export default function PluginSync() {
  const { status, log, connect, disconnect, send } = useWebSocket(WS_URL)
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