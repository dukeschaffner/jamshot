'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = 'ws://localhost:59327';
const RETRY_INTERVAL = 10000; // 10 seconds

// Context
const PluginWebSocketContext = createContext(null);

// Provider
export function PluginWebSocketProvider({ children }) {
  const ws = useRef(null);
  const retryTimer = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const [log, setLog] = useState([]);

  const addLog = useCallback((text, type = 'system') => {
    setLog(prev => [...prev, { text, type, id: Date.now() + Math.random() }]);
  }, []);

  const connect = useCallback(() => {
    if (ws.current) return; // already connecting/connected
    try{
      setStatus('connecting');
      addLog('Connecting to ' + WS_URL);
      console.log('Connecting to ' + WS_URL);
  
      ws.current = new WebSocket(WS_URL);
  
      ws.current.onopen = () => {
        console.log('Connected');
        setStatus('connected');
        addLog('Connected');
        if (retryTimer.current) {
          clearTimeout(retryTimer.current);
          retryTimer.current = null;
        }
      };
  
      ws.current.onclose = () => {
        console.log('Disconnected');
        setStatus('disconnected');
        addLog('Disconnected');
        ws.current = null;
  
        // Retry every 10 seconds
        retryTimer.current = setTimeout(() => {
          connect();
        }, RETRY_INTERVAL);
      };
  
      ws.current.onerror = (err) => {
        setStatus('error');
        addLog('Connection error');
        console.error('WebSocket error:', err);
      };
  
      ws.current.onmessage = (e) => {
        addLog(e.data, 'incoming');
      };
    }
    catch (err) {
      setStatus('error');
      addLog('Connection error');
    }
  }, [addLog]);

  const disconnect = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    ws.current?.close();
    ws.current = null;
    setStatus('disconnected');
    addLog('Manually disconnected');
  }, [addLog]);

  const send = useCallback((msg) => {
    if (!msg.trim()) return false;

    // If not connected, try to connect first
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      addLog('Attempting to connect before sending...');
      connect();
    }

    ws.current.send(msg);
    addLog(msg, 'outgoing');
    return true;
  }, [addLog, connect]);

  // auto connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <PluginWebSocketContext.Provider value={{ status, log, connect, disconnect, send }}>
      {children}
    </PluginWebSocketContext.Provider>
  );
}

// Hook to use context
export function usePluginWebSocket() {
  const context = useContext(PluginWebSocketContext);
  if (!context) {
    throw new Error('usePluginWebSocket must be used within PluginWebSocketProvider');
  }
  return context;
}