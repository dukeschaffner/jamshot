'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import ConfirmationDialog from '../components/ConfirmationDialog';
import Link from 'next/link';
import { useToast } from '../lib/ToastContext';

const WS_URL = 'ws://localhost:59327';
const USER_HAS_PLUGIN_KEY = 'user_has_plugin';

// Context
const PluginWebSocketContext = createContext(null);

// Provider
export function PluginWebSocketProvider({ children }) {
  const ws = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const [log, setLog] = useState([]);
  const [showPluginErrorDialog, setShowPluginErrorDialog] = useState(false);
  const [pluginErrorMessage, setPluginErrorMessage] = useState('');
  const [userHasPlugin, setUserHasPlugin] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(USER_HAS_PLUGIN_KEY) === 'true';
  });
  const { showSuccess, showError } = useToast();

  const addLog = useCallback((text, type = 'system') => {
    setLog(prev => [...prev, { text, type, id: Date.now() + Math.random() }]);
  }, []);

  const successMessages = {
    'set_track': 'Track opened in plugin successfully!',
    'stem_metadata_sync': 'Edits synced to plugin successfully!',
  };

  const errorMessages = {
    'set_track': 'Failed to open track in plugin. Make sure the plugin is installed and running in a DAW.',
    'stem_metadata_sync': 'Failed to sync edits to plugin. Make sure the plugin is installed and running in a DAW.',
  };

  const getMessageType = (msg) => {
    if (!msg) return null;
    if (typeof msg !== 'string') return msg?.type || null;
    try {
      const parsed = JSON.parse(msg);
      return parsed?.type || null;
    } catch {
      // Not JSON
      const parts = msg.split(':');
      return parts[0];
    }
  };


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

        // Track that the user has the plugin installed / running
        try {
          localStorage.setItem(USER_HAS_PLUGIN_KEY, 'true');
          setUserHasPlugin(true);
        } catch (err) {
          // Ignore localStorage failures (e.g. private mode)
        }
      };
  
      ws.current.onclose = () => {
        console.log('Disconnected');
        setStatus('disconnected');
        addLog('Disconnected');
        ws.current = null;
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
    ws.current?.close();
    ws.current = null;
    setStatus('disconnected');
    addLog('Manually disconnected');
  }, [addLog]);

  const send = useCallback((msg) => {
    if (!msg || (typeof msg === 'string' && !msg.trim())) return false;

    const type = getMessageType(msg);
    const successMessage = successMessages[type];
    const errorMessage = errorMessages[type] || 'Failed to send message to plugin. Make sure the plugin is installed and running in a DAW.';

    // If not connected, try to connect first, but treat this as a failure for this send call
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      addLog('Attempting to connect before sending...');
      connect();

      if (userHasPlugin) {
        showError(errorMessage);
      } else {
        setPluginErrorMessage(errorMessage);
        setShowPluginErrorDialog(true);
      }
      return false;
    }

    try {
      ws.current.send(msg);
      addLog(msg, 'outgoing');

      if (successMessage) {
        showSuccess(successMessage);
      }
      return true;
    } catch (err) {
      console.error('WebSocket send error:', err);
      addLog('Send failed: ' + errorMessage, 'system');

      if (userHasPlugin) {
        showError(errorMessage);
      } else {
        setPluginErrorMessage(errorMessage);
        setShowPluginErrorDialog(true);
      }
      return false;
    }
  }, [addLog, connect, showSuccess, showError, userHasPlugin]);


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
      <ConfirmationDialog
        isOpen={showPluginErrorDialog}
        onClose={() => setShowPluginErrorDialog(false)}
        onConfirm={() => setShowPluginErrorDialog(false)}
        title="Plugin Not Detected"
        message={
          <>
            {pluginErrorMessage || 'Failed to connect to plugin. Make sure the plugin is installed and running in a DAW.'}{' '}
            <Link href="/plugin" className="link-underline" style={{ color: 'var(--seafoam-dark)' }}>
              Install plugin here
            </Link>.
          </>
        }
        confirmText="OK"
        variant="default"
      />
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