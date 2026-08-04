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
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import {
  PROJECT_PRESENCE_HEARTBEAT_MS,
  PROJECT_WS_PROTOCOL_VERSION,
} from './ProjectsConfig';
import { buildProjectWsConnectUrl } from './projectWsConnectUrl';
import { reloadForProjectAccessRevoked } from './projectAccessRevoked';

const RECONNECT_DELAY_MS = 3000;
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const OP_ACK_TIMEOUT_MS = 10000;
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
 * @typedef {object} ProjectOpResult
 * @property {boolean} ok
 * @property {number} [revision]
 * @property {string} [code]
 * @property {string} [message]
 * @property {number} [currentRevision]
 * @property {boolean} [fallbackRest]
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
  const [metadataLockHolder, setMetadataLockHolder] = useState(/** @type {string|null} */ (null));

  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const lockHeartbeatRef = useRef(null);
  const heldTrackIdsRef = useRef(new Set());
  /** Track IDs that should be released as soon as a pending acquire settles. */
  const pendingReleaseTrackIdsRef = useRef(new Set());
  const holdsMetadataLockRef = useRef(false);
  const revisionRef = useRef(project?.revision ?? null);
  const hasJoinedRef = useRef(false);
  const suppressReconnectRef = useRef(false);
  const pendingAcquireRef = useRef(
    /** @type {Map<string, { resolve: (ok: boolean) => void, trackId: number }>} */ (new Map())
  );
  const pendingMetadataAcquireRef = useRef(/** @type {{ resolve: (ok: boolean) => void } | null} */ (null));
  const pendingOpsRef = useRef(
    /** @type {Map<string, { resolve: (result: ProjectOpResult) => void }>} */ (new Map())
  );

  const sendTrackLockRelease = useCallback((numericTrackId) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'lock_release',
          resource: { type: 'track', id: numericTrackId },
        })
      );
    }
    heldTrackIdsRef.current.delete(numericTrackId);
  }, []);

  const projectRef = project?.guid ?? project?.id;

  useEffect(() => {
    if (project?.revision != null) {
      revisionRef.current = project.revision;
    }
  }, [project?.revision]);

  const applyLockAcquired = useCallback((trackId, userId) => {
    const key = String(trackId);
    const pending = pendingAcquireRef.current.get(key);
    const releaseRequested = pendingReleaseTrackIdsRef.current.has(trackId);

    if (userId === user?.id && releaseRequested) {
      pendingReleaseTrackIdsRef.current.delete(trackId);
      pendingAcquireRef.current.delete(key);
      sendTrackLockRelease(trackId);
      if (pending) {
        pending.resolve(false);
      }
      return;
    }

    setTrackLockHolders((prev) => ({ ...prev, [trackId]: userId }));
    if (userId === user?.id) {
      heldTrackIdsRef.current.add(trackId);
    }
    if (pending) {
      pendingAcquireRef.current.delete(key);
      pending.resolve(userId === user?.id);
    }
  }, [sendTrackLockRelease, user?.id]);

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

  const applyMetadataLockAcquired = useCallback((userId) => {
    setMetadataLockHolder(userId);
    if (userId === user?.id) {
      holdsMetadataLockRef.current = true;
    }
    if (pendingMetadataAcquireRef.current) {
      pendingMetadataAcquireRef.current.resolve(userId === user?.id);
      pendingMetadataAcquireRef.current = null;
    }
  }, [user?.id]);

  const applyMetadataLockReleased = useCallback((userId) => {
    setMetadataLockHolder((current) => (current === userId ? null : current));
    if (userId === user?.id) {
      holdsMetadataLockRef.current = false;
    }
  }, [user?.id]);

  const clearLocalSyncState = useCallback(() => {
    setOnlineUsers([]);
    setTrackLockHolders({});
    setMetadataLockHolder(null);
    heldTrackIdsRef.current.clear();
    pendingReleaseTrackIdsRef.current.clear();
    holdsMetadataLockRef.current = false;
    pendingAcquireRef.current.clear();
    pendingMetadataAcquireRef.current = null;
    for (const pending of pendingOpsRef.current.values()) {
      pending.resolve({ ok: false, fallbackRest: true });
    }
    pendingOpsRef.current.clear();
  }, []);

  const handleWsMessage = useCallback(
    (data) => {
      if (
        data.type === 'error' &&
        (data.code === 'ACCESS_REVOKED' ||
          (data.code === 'ACCESS_DENIED' && !hasJoinedRef.current))
      ) {
        suppressReconnectRef.current = true;
        hasJoinedRef.current = false;
        setConnectionStatus('revoked');
        clearLocalSyncState();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
        reloadForProjectAccessRevoked();
        return;
      }

      // Room row was dropped (e.g. kick) — re-join; ACCESS_DENIED stops the session.
      if (data.type === 'error' && data.code === 'NOT_JOINED') {
        hasJoinedRef.current = false;
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN && projectRef) {
          ws.send(
            JSON.stringify({
              type: 'join',
              projectId: projectRef,
              revision: revisionRef.current ?? null,
              protocolVersion: PROJECT_WS_PROTOCOL_VERSION,
            })
          );
        }
        return;
      }

      if (data.type === 'presence' && Array.isArray(data.users)) {
        setOnlineUsers(data.users);
        return;
      }

      if (data.type === 'joined') {
        hasJoinedRef.current = true;
        if (data.revision != null) {
          revisionRef.current = data.revision;
        }
        return;
      }

      if (data.type === 'state' && data.project) {
        if (data.revision != null) {
          revisionRef.current = data.revision;
        }
        eventBus.emit(DAW_EVENTS.PROJECT.WS_STATE_RESYNC, data);
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

      if (data.type === 'lock' && data.resource?.type === 'project_metadata') {
        if (!data.userId) return;
        if (data.action === 'acquired') {
          applyMetadataLockAcquired(data.userId);
        } else if (data.action === 'released') {
          applyMetadataLockReleased(data.userId);
        }
        return;
      }

      if (data.type === 'op') {
        eventBus.emit(DAW_EVENTS.PROJECT.REMOTE_OP, data);
        return;
      }

      if (data.type === 'op_ack' && data.opId) {
        const pending = pendingOpsRef.current.get(data.opId);
        if (pending) {
          pendingOpsRef.current.delete(data.opId);
          if (data.revision != null) {
            revisionRef.current = data.revision;
          }
          pending.resolve({
            ok: true,
            revision: data.revision,
            payload: data.payload,
          });
        }
        return;
      }

      if (data.type === 'op_nack' && data.opId) {
        const pending = pendingOpsRef.current.get(data.opId);
        if (pending) {
          pendingOpsRef.current.delete(data.opId);
          pending.resolve({
            ok: false,
            code: data.code,
            message: data.message,
            currentRevision: data.currentRevision ?? data.current_revision ?? null,
          });
        }
        return;
      }

      if (data.type === 'error' && data.code === 'LOCK_DENIED') {
        if (data.resource?.type === 'project_metadata') {
          if (pendingMetadataAcquireRef.current) {
            pendingMetadataAcquireRef.current.resolve(false);
            pendingMetadataAcquireRef.current = null;
          }
          return;
        }

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
    [
      applyLockAcquired,
      applyLockReleased,
      applyMetadataLockAcquired,
      applyMetadataLockReleased,
      clearLocalSyncState,
      projectRef,
    ]
  );

  useEffect(() => {
    if (!projectRef || !user?.id) {
      return undefined;
    }

    let cancelled = false;
    let reconnectTimer = null;
    hasJoinedRef.current = false;
    suppressReconnectRef.current = false;

    const connect = async () => {
      if (cancelled || suppressReconnectRef.current) {
        return;
      }

      let url;
      try {
        url = await buildProjectWsConnectUrl(user.id);
      } catch (error) {
        console.error('Project sync connect URL error:', error);
        setConnectionStatus('error');
        return;
      }

      if (cancelled || suppressReconnectRef.current) {
        return;
      }

      setConnectionStatus('connecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || suppressReconnectRef.current) {
          return;
        }
        setConnectionStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'join',
            projectId: projectRef,
            revision: revisionRef.current ?? null,
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
        hasJoinedRef.current = false;
        clearLocalSyncState();
        if (suppressReconnectRef.current) {
          setConnectionStatus('revoked');
          return;
        }
        setConnectionStatus('idle');
        reconnectTimer = setTimeout(() => {
          void connect();
        }, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        if (!cancelled && !suppressReconnectRef.current) {
          setConnectionStatus('error');
        }
      };
    };

    void connect();

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
      clearLocalSyncState();
    };
  }, [projectRef, user?.id, handleWsMessage, clearLocalSyncState]);

  const isWsConnected = useCallback(
    () => connectionStatus === 'connected',
    [connectionStatus]
  );

  const sendProjectOp = useCallback(
    (payload) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || connectionStatus !== 'connected') {
        return Promise.resolve({ ok: false, fallbackRest: true });
      }

      if (revisionRef.current == null) {
        return Promise.resolve({ ok: false, fallbackRest: true });
      }

      const opId = crypto.randomUUID();

      return new Promise((resolve) => {
        pendingOpsRef.current.set(opId, { resolve });

        ws.send(
          JSON.stringify({
            type: 'op',
            opId,
            baseRevision: revisionRef.current,
            payload,
          })
        );

        setTimeout(() => {
          const pending = pendingOpsRef.current.get(opId);
          if (pending) {
            pendingOpsRef.current.delete(opId);
            resolve({ ok: false, fallbackRest: true });
          }
        }, OP_ACK_TIMEOUT_MS);
      });
    },
    [connectionStatus]
  );

  const announceClipCreate = useCallback(
    ({ clipId, revision }) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || connectionStatus !== 'connected') {
        return;
      }
      if (clipId == null || revision == null) {
        return;
      }

      ws.send(
        JSON.stringify({
          type: 'clip_announce',
          clipId,
          revision,
        })
      );
    },
    [connectionStatus]
  );

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

      // A new acquire cancels any prior release-while-pending intent for this track.
      pendingReleaseTrackIdsRef.current.delete(numericTrackId);

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

    const key = String(numericTrackId);
    if (pendingAcquireRef.current.has(key)) {
      // Acquire ack may arrive after this release — drop the lock on settle.
      pendingReleaseTrackIdsRef.current.add(numericTrackId);
    }

    if (!heldTrackIdsRef.current.has(numericTrackId)) {
      return;
    }

    sendTrackLockRelease(numericTrackId);
  }, [sendTrackLockRelease]);

  const acquireMetadataLock = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || connectionStatus !== 'connected') {
      return Promise.resolve(true);
    }

    if (holdsMetadataLockRef.current) {
      return Promise.resolve(true);
    }

    if (metadataLockHolder && metadataLockHolder !== user?.id) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      pendingMetadataAcquireRef.current = { resolve };
      ws.send(
        JSON.stringify({
          type: 'lock_acquire',
          resource: { type: 'project_metadata' },
        })
      );
      setTimeout(() => {
        if (pendingMetadataAcquireRef.current) {
          pendingMetadataAcquireRef.current = null;
          resolve(false);
        }
      }, LOCK_ACQUIRE_TIMEOUT_MS);
    });
  }, [connectionStatus, metadataLockHolder, user?.id]);

  const releaseMetadataLock = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !holdsMetadataLockRef.current) {
      holdsMetadataLockRef.current = false;
      return;
    }

    ws.send(
      JSON.stringify({
        type: 'lock_release',
        resource: { type: 'project_metadata' },
      })
    );
    holdsMetadataLockRef.current = false;
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
      metadataLockHolder,
      acquireTrackLock,
      releaseTrackLock,
      releaseAllHeldTrackLocks,
      acquireMetadataLock,
      releaseMetadataLock,
      isTrackLockedByOther,
      isWsConnected,
      sendProjectOp,
      announceClipCreate,
    }),
    [
      onlineUsers,
      connectionStatus,
      trackLockHolders,
      metadataLockHolder,
      acquireTrackLock,
      releaseTrackLock,
      releaseAllHeldTrackLocks,
      acquireMetadataLock,
      releaseMetadataLock,
      isTrackLockedByOther,
      isWsConnected,
      sendProjectOp,
      announceClipCreate,
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
      metadataLockHolder: null,
      acquireTrackLock: async () => true,
      releaseTrackLock: () => {},
      releaseAllHeldTrackLocks: () => {},
      acquireMetadataLock: async () => true,
      releaseMetadataLock: () => {},
      isTrackLockedByOther: () => false,
      isWsConnected: () => false,
      sendProjectOp: async () => ({ ok: false, fallbackRest: true }),
      announceClipCreate: () => {},
    };
  }
  return context;
}
