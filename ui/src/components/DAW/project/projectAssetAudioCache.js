import { PROJECT_ASSET_CACHE_MAX_BYTES } from './ProjectsConfig';

const DB_NAME = 'jamshot_project_asset_cache';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

export function buildProjectAssetCacheKey(projectGuid, assetId) {
  return `${projectGuid}_asset_${assetId}`;
}

export function getProjectAssetCacheMaxBytes() {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PROJECT_ASSET_CACHE_MAX_BYTES) {
    const parsed = Number(process.env.NEXT_PUBLIC_PROJECT_ASSET_CACHE_MAX_BYTES);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return PROJECT_ASSET_CACHE_MAX_BYTES;
}

function isCacheEnabled() {
  return (
    typeof window !== 'undefined' &&
    !!window.indexedDB &&
    getProjectAssetCacheMaxBytes() > 0
  );
}

let dbPromise = null;

function openDb() {
  if (!isCacheEnabled()) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn('Project asset cache: failed to open IndexedDB', request.error);
        reject(request.error);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
    }).catch(() => null);
  }

  return dbPromise;
}

function runTransaction(mode, callback) {
  return openDb().then((db) => {
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      Promise.resolve(callback(store))
        .then((value) => {
          result = value;
        })
        .catch((error) => {
          try {
            tx.abort();
          } catch {
            // Transaction may already be finished.
          }
          reject(error);
        });
    });
  });
}

function getEntry(store, cacheKey) {
  return new Promise((resolve, reject) => {
    const request = store.get(cacheKey);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

function putEntry(store, entry) {
  return new Promise((resolve, reject) => {
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteEntry(store, cacheKey) {
  return new Promise((resolve, reject) => {
    const request = store.delete(cacheKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getAllEntries(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

async function evictIfNeeded(store) {
  const maxBytes = getProjectAssetCacheMaxBytes();
  if (maxBytes <= 0) return;

  const entries = await getAllEntries(store);
  let totalBytes = entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);

  if (totalBytes <= maxBytes) return;

  entries.sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0));

  for (const entry of entries) {
    if (totalBytes <= maxBytes) break;
    await deleteEntry(store, entry.cacheKey);
    totalBytes -= entry.sizeBytes ?? 0;
  }
}

/**
 * Read raw audio bytes for a project asset from IndexedDB.
 * Returns null on miss, invalid URL, or cache disabled.
 */
export async function readCachedProjectAssetAudio({ projectGuid, assetId, audioUrl }) {
  if (!isCacheEnabled() || !projectGuid || assetId == null || !audioUrl) {
    return null;
  }

  try {
    const cacheKey = buildProjectAssetCacheKey(projectGuid, assetId);

    return await runTransaction('readwrite', async (store) => {
      const entry = await getEntry(store, cacheKey);
      if (!entry?.data) {
        return null;
      }

      if (entry.audioUrl && entry.audioUrl !== audioUrl) {
        await deleteEntry(store, cacheKey);
        return null;
      }

      entry.lastAccessed = Date.now();
      await putEntry(store, entry);
      return entry.data;
    });
  } catch (error) {
    console.warn('Project asset cache: read failed', error);
    return null;
  }
}

/**
 * Persist raw audio bytes for a project asset and run LRU eviction.
 */
export async function writeCachedProjectAssetAudio({
  projectGuid,
  assetId,
  audioUrl,
  data,
}) {
  if (!isCacheEnabled() || !projectGuid || assetId == null || !audioUrl || !data) {
    return;
  }

  try {
    const cacheKey = buildProjectAssetCacheKey(projectGuid, assetId);
    const entry = {
      cacheKey,
      projectGuid,
      assetId,
      audioUrl,
      data,
      sizeBytes: data.byteLength,
      lastAccessed: Date.now(),
    };

    await runTransaction('readwrite', async (store) => {
      await putEntry(store, entry);
      await evictIfNeeded(store);
    });
  } catch (error) {
    console.warn('Project asset cache: write failed', error);
  }
}

/** Remove a single cached project asset (e.g. after asset deletion). */
export async function deleteCachedProjectAsset({ projectGuid, assetId }) {
  if (!isCacheEnabled() || !projectGuid || assetId == null) {
    return;
  }

  try {
    const cacheKey = buildProjectAssetCacheKey(projectGuid, assetId);
    await runTransaction('readwrite', (store) => deleteEntry(store, cacheKey));
  } catch (error) {
    console.warn('Project asset cache: delete failed', error);
  }
}
