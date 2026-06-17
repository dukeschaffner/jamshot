'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LOCK_HEARTBEAT_INTERVAL_SECONDS } from '@sterio/subscription-utils';
import { useUser } from '@/contexts/UserContext';
import {
  PROJECT_PRESENCE_HEARTBEAT_MS,
  PROJECT_WS_PROTOCOL_VERSION,
} from './ProjectsConfig';
import { buildProjectWsConnectUrl } from './projectWsConnectUrl';

const RECONNECT_DELAY_MS = 3000;
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const LOCK_HEARTBEAT_MS = LOCK_HEARTBEAT_INTERVAL_SECONDS * 1000;

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
  const [trackLockHolders, setTrackLockHolders] = useState(
    /** @type {Record<number, string>} */ ({})
  );
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const lockHeartbeatRef = useRef(null);
  const heldTrackIdsRef = useRef(new Set());
  const pendingAcquireRef = useRef(
    /** @type {Map<string, { resolve: (ok: boolean) => void, trackId: number }>} */ (new Map())
  );

  const projectRef = project?.guid ?? project?.id;
  const revision = project?.revision;

  const applyLockAcquired = useCallback((trackId, userId) => {
    setTrackLockHolders((prev) => ({ ...prev, [trackId]: userId }));
    if (userId === user?.id) {
      heldTrackIdsRef.current.add(trackId);
    }
    const pending = pendingAcquireRef.current.get(String(trackId));
    if (pending) {
      pendingAcquireRef.current.delete(String(trackId));
      pending.resolve(userId === user?.id);
    }
  }, [user?.id]);

  const applyLockReleased = useCallback((trackId, userId) => {
    setTrackLockHolders((prev) => {
      if (prev[trackId] !== userId) {
        return prev;
      }
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
    if (userId === user?.id) {
      heldTrackIdsRef.current.delete(trackId);
    }
  }, [user?.id]);

  const handleWsMessage = useCallback(
    (data) => {
      if (data.type === 'presence' && Array.isArray(data.users)) {
        setOnlineUsers(data.users);
        return;
      }

      if (data.type === 'lock' && data.resource?.type === 'track') {
        const trackId = Number(data.resource.id);
        if (!Number.isFinite(trackId) || !data.userId) {
          return;
        }
        if (data.action === 'acquired') {
          applyLockAcquired(trackId, data.userId);
        } else if (data.action === 'released') {
          applyLockReleased(trackId, data.userId);
        }
        return;
      }

      if (data.type === 'error' && data.code === 'LOCK_DENIED') {
        const trackId = Number(data.resource?.id);
        if (Number.isFinite(trackId)) {
          const pending = pendingAcquireRef.current.get(String(trackId));
          if (pending) {
            pending.resolve(false);
            pendingAcquireRef.current.delete(String(trackId));
          }
        }
      }
    },
    [applyLockAcquired, applyLockReleased]
  );

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
          handleWsMessage(data);
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
        setTrackLockHolders({});
        heldTrackIdsRef.current.clear();
        pendingAcquireRef.current.clear();
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
        const heldIds = [...heldTrackIdsRef.current];
        const editingTrackId = heldIds.length > 0 ? heldIds[heldIds.length - 1] : undefined;
        ws.send(
          JSON.stringify({
            type: 'presence',
            ...(editingTrackId != null ? { editingTrackId } : {}),
          })
        );
      }
    }, PROJECT_PRESENCE_HEARTBEAT_MS);

    lockHeartbeatRef.current = setInterval(() => {
      const ws = wsRef.current;
      const heldIds = [...heldTrackIdsRef.current];
      if (ws?.readyState === WebSocket.OPEN && heldIds.length > 0) {
        ws.send(JSON.stringify({ type: 'lock_heartbeat', trackIds: heldIds }));
      }
    }, LOCK_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(heartbeatRef.current);
      clearInterval(lockHeartbeatRef.current);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      heldTrackIdsRef.current.clear();
      pendingAcquireRef.current.clear();
    };
  }, [projectRef, revision, user?.id, handleWsMessage]);

  const acquireTrackLock = useCallback(
    (trackId) => {
      const numericTrackId = Number(trackId);
      if (!Number.isFinite(numericTrackId)) {
        return Promise.resolve(false);
      }

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || connectionStatus !== 'connected') {
        return Promise.resolve(true);
      }

      if (heldTrackIdsRef.current.has(numericTrackId)) {
        return Promise.resolve(true);
      }

      const holder = trackLockHolders[numericTrackId];
      if (holder && holder !== user?.id) {
        return Promise.resolve(false);
      }

      return new Promise((resolve) => {
        const key = String(numericTrackId);
        pendingAcquireRef.current.set(key, { resolve, trackId: numericTrackId });
        ws.send(
          JSON.stringify({
            type: 'lock_acquire',
            resource: { type: 'track', id: numericTrackId },
          })
        );
        setTimeout(() => {
          const pending = pendingAcquireRef.current.get(key);
          if (pending) {
            pendingAcquireRef.current.delete(key);
            resolve(false);
          }
        }, LOCK_ACQUIRE_TIMEOUT_MS);
      });
    },
    [connectionStatus, trackLockHolders, user?.id]
  );

  const releaseTrackLock = useCallback((trackId) => {
    const numericTrackId = Number(trackId);
    if (!Number.isFinite(numericTrackId)) {
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      heldTrackIdsRef.current.delete(numericTrackId);
      return;
    }

    if (!heldTrackIdsRef.current.has(numericTrackId)) {
      return;
    }

    ws.send(
      JSON.stringify({
        type: 'lock_release',
        resource: { type: 'track', id: numericTrackId },
      })
    );
    heldTrackIdsRef.current.delete(numericTrackId);
  }, []);

  const releaseAllHeldTrackLocks = useCallback(() => {
    const heldIds = [...heldTrackIdsRef.current];
    for (const trackId of heldIds) {
      releaseTrackLock(trackId);
    }
  }, [releaseTrackLock]);

  const isTrackLockedByOther = useCallback(
    (trackId) => {
      const numericTrackId = Number(trackId);
      const holder = trackLockHolders[numericTrackId];
      return Boolean(holder && holder !== user?.id);
    },
    [trackLockHolders, user?.id]
  );

  const value = useMemo(
    () => ({
      onlineUsers,
      connectionStatus,
      trackLockHolders,
      acquireTrackLock,
      releaseTrackLock,
      releaseAllHeldTrackLocks,
      isTrackLockedByOther,
    }),
    [
      onlineUsers,
      connectionStatus,
      trackLockHolders,
      acquireTrackLock,
      releaseTrackLock,
      releaseAllHeldTrackLocks,
      isTrackLockedByOther,
    ]
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
      trackLockHolders: {},
      acquireTrackLock: async () => true,
      releaseTrackLock: () => {},
      releaseAllHeldTrackLocks: () => {},
      isTrackLockedByOther: () => false,
    };
  }
  return context;
}
