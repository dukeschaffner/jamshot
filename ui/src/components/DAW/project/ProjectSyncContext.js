'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUser } from '@/contexts/UserContext';
import {
  PROJECT_PRESENCE_HEARTBEAT_MS,
  PROJECT_WS_PROTOCOL_VERSION,
} from './ProjectsConfig';
import { buildProjectWsConnectUrl } from './projectWsConnectUrl';

const RECONNECT_DELAY_MS = 3000;

const ProjectSyncContext = createContext(null);

/**
 * @typedef {object} ProjectPresenceUser
 * @property {string} userId
 * @property {string} username
 * @property {string|null} [profilePicUrl]
 * @property {number} [editingTrackId]
 */

/**
 * @param {object} props
 * @param {object|null} props.project
 * @param {React.ReactNode} props.children
 */
export function ProjectSyncProvider({ project, children }) {
  const { user } = useUser();
  const [onlineUsers, setOnlineUsers] = useState(/** @type {ProjectPresenceUser[]} */ ([]));
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);

  const projectRef = project?.guid ?? project?.id;
  const revision = project?.revision;

  useEffect(() => {
    if (!projectRef || !user?.id) {
      return undefined;
    }

    let cancelled = false;
    let reconnectTimer = null;

    const connect = () => {
      if (cancelled) {
        return;
      }

      let url;
      try {
        url = buildProjectWsConnectUrl(user.id);
      } catch (error) {
        console.error('Project sync connect URL error:', error);
        setConnectionStatus('error');
        return;
      }

      setConnectionStatus('connecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          return;
        }
        setConnectionStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'join',
            projectId: projectRef,
            revision: revision ?? null,
            protocolVersion: PROJECT_WS_PROTOCOL_VERSION,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'presence' && Array.isArray(data.users)) {
            setOnlineUsers(data.users);
          }
        } catch (error) {
          console.error('Project sync message parse error:', error);
        }
      };

      ws.onclose = () => {
        if (cancelled) {
          return;
        }
        setConnectionStatus('idle');
        setOnlineUsers([]);
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        if (!cancelled) {
          setConnectionStatus('error');
        }
      };
    };

    connect();

    heartbeatRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'presence' }));
      }
    }, PROJECT_PRESENCE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(heartbeatRef.current);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [projectRef, revision, user?.id]);

  const value = useMemo(
    () => ({
      onlineUsers,
      connectionStatus,
    }),
    [onlineUsers, connectionStatus]
  );

  return (
    <ProjectSyncContext.Provider value={value}>
      {children}
    </ProjectSyncContext.Provider>
  );
}

export function useProjectSync() {
  const context = useContext(ProjectSyncContext);
  if (!context) {
    return {
      onlineUsers: [],
      connectionStatus: 'idle',
    };
  }
  return context;
}
