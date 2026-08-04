import { PROJECT_TRACK_MUTE_SOLO_STORAGE_KEY } from './ProjectsConfig';

function storageKey(projectGuid) {
  return `${PROJECT_TRACK_MUTE_SOLO_STORAGE_KEY}:${projectGuid}`;
}

function readAll(projectGuid) {
  if (typeof window === 'undefined' || !projectGuid) return {};
  try {
    const raw = localStorage.getItem(storageKey(projectGuid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(projectGuid, map) {
  if (typeof window === 'undefined' || !projectGuid) return;
  try {
    localStorage.setItem(storageKey(projectGuid), JSON.stringify(map));
  } catch {
    // Quota or private mode — ignore.
  }
}

/**
 * @returns {{ muted: boolean, solo: boolean } | null}
 */
export function readTrackMuteSolo(projectGuid, trackId) {
  if (trackId == null) return null;
  const map = readAll(projectGuid);
  const entry = map[String(trackId)];
  if (!entry || typeof entry !== 'object') return null;
  return {
    muted: !!entry.muted,
    solo: !!entry.solo,
  };
}

/**
 * Persist mute/solo for a track. When solo is true, clears solo on all other tracks
 * in the same project (exclusive solo).
 */
export function writeTrackMuteSolo(projectGuid, trackId, { muted, solo }) {
  if (trackId == null || !projectGuid) return;

  const map = readAll(projectGuid);
  const key = String(trackId);

  if (solo) {
    for (const otherKey of Object.keys(map)) {
      if (otherKey !== key && map[otherKey]) {
        map[otherKey] = { ...map[otherKey], solo: false };
      }
    }
  }

  map[key] = {
    muted: !!muted,
    solo: !!solo,
  };

  writeAll(projectGuid, map);
}
