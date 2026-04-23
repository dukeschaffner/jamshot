
import api from '../../../../lib/api';
import { MAX_NODES_PER_LEVEL, PRUNING_METHOD, MAX_VISIBLE_NODES, PRUNING_METHODS } from './config';

/**
 * Subset of at most `limit` items from `tracks` that always includes `idx`, preferring
 * a balanced window around the target; clamps to the start or end when near boundaries.
 * Tracks are ordered newest -> oldest; `idx` is the target's index in that array.
 */
function sliceTracksAroundIndex(tracks, idx, limit) {
  const n = tracks.length;
  if (n === 0 || idx < 0 || idx >= n) return [];
  const L = Math.min(limit, n);
  if (L === n) {
    return tracks.slice();
  }
  const left = Math.floor((L - 1) / 2);
  let start = idx - left;
  let end = start + L;
  if (start < 0) {
    start = 0;
    end = L;
  } else if (end > n) {
    end = n;
    start = n - L;
  }
  return tracks.slice(start, end);
}

class TracksWindow {
  constructor(tracks, paginationData) {
    this.startId = tracks[0].id; // newest track id
    this.endId = tracks[tracks.length - 1].id; // oldest track id
    this.startCreatedAt = tracks[0].created_at;
    this.endCreatedAt = tracks[tracks.length - 1].created_at;
    this.tracks = tracks;

    this.nextNewestTrackId = paginationData?.nextNewestTrackId;
    this.nextOldestTrackId = paginationData?.nextOldestTrackId;
    this.nextNewestCreatedAt = paginationData?.nextNewestCreatedAt;
    this.nextOldestCreatedAt = paginationData?.nextOldestCreatedAt;
  }

  getTracks() {
    return this.tracks;
  }

  getStartId() {
    return this.startId;
  }

  getStartCreatedAt() {
    return this.startCreatedAt;
  }

  setStartCreatedAt(createdAt) {
    this.startCreatedAt = createdAt;
  }

  getEndCreatedAt() {
    return this.endCreatedAt;
  }

  setEndCreatedAt(createdAt) {
    this.endCreatedAt = createdAt;
  }

  getNextNewestTrackId() {
    return this.nextNewestTrackId;
  }

  setNextNewestTrackId(trackId) {
    this.nextNewestTrackId = trackId;
  }

  getNextOldestTrackId() {
    return this.nextOldestTrackId;
  }

  setNextOldestTrackId(trackId) {
    this.nextOldestTrackId = trackId;
  }

  getNextNewestCreatedAt() {
    return this.nextNewestCreatedAt;
  }

  setNextNewestCreatedAt(createdAt) {
    this.nextNewestCreatedAt = createdAt;
  }

  getNextOldestCreatedAt() {
    return this.nextOldestCreatedAt;
  }

  setNextOldestCreatedAt(createdAt) {
    this.nextOldestCreatedAt = createdAt;
  }

  getEndId() {
    return this.endId;
  }
}


class PaginationData {
  constructor(
      oldestKnownTrackId,
      newestKnownTrackId,
      hasOlder = false,
      hasNewer = false
    ) {
    this.oldestKnownTrackId = oldestKnownTrackId;
    this.newestKnownTrackId = newestKnownTrackId;
    this.hasOlder = hasOlder;
    this.hasNewer = hasNewer;
  }
  getOldestKnownTrackId() {
    return this.oldestKnownTrackId;
  }

  getNewestKnownTrackId() {
    return this.newestKnownTrackId;
  }

  getHasOlder() { // A track older than the oldest loaded track exists
    return this.hasOlder;
  }

  getHasNewer() { // A track newer than the newest loaded track exists
    return this.hasNewer;
  }

  setHasOlder(hasOlder) {
    this.hasOlder = hasOlder;
  }

  setHasNewer(hasNewer) {
    this.hasNewer = hasNewer;
  }
}


export class TreeDataManager {
  constructor(secret) {
    this.trackData = new Map();
    this.trackWindowsForParent = new Map();
    this.paginationData = new Map();
    this.usageData = new Map();
    this.newKidsAvailable = new Map(); // parentTrackId -> array of new child track objects not yet in trackData
    this.rootTrackId = null;
    this.testMode = false;
    this.secret = secret;
  }

  getWindowContainingTrack = (parentTrackId, trackId) => {
    const windows = this.trackWindowsForParent.get(parentTrackId);
    if(!windows) {
      throw new Error('Unexpected error: No windows found for parent track id');
    }
    const window = windows.find(window => trackId <= window.getStartId() && trackId >= window.getEndId());
    if(!window) {
      throw new Error('Unexpected error: Track id not found in any window');
    }
    return window;
  }

  getWindowContainingRange = (parentTrackId, startId, endId) => {
    const windows = this.trackWindowsForParent.get(parentTrackId);
    if(!windows) {
      throw new Error('Unexpected error: No windows found for parent track id');
    }
    const window = windows.find(window => startId <= window.getStartId() && endId >= window.getEndId());
    if(!window) {
      throw new Error('Unexpected error: StartId or endId not found in any window');
    }
    return window;
  }

  // Fetch children for a track with optional lastId for cursor pagination
  fetchChildren = async (parentTrackId, lastId = null, orderBy = 'newest') => {
    let data = null;
    const params = {
      limit: MAX_NODES_PER_LEVEL,
      includeChildCount: true,
      includeParent: false,
      orderBy: orderBy
    };
    
    if (lastId) {
      params.lastId = lastId;
    }

    if (this.testMode) {
      const response = await api.get(`/tracks/${parentTrackId}/related-test`, { params });
      data = response.data;
    }
    else {
      const response = await api.get(`/tracks/${parentTrackId}/related2`, { params });
      data = response.data;
    }

    return {id: parentTrackId, data: data};
  }

  fetchSiblingTracksAroundTarget = async (parentTrackId, targetTrackId, limit = 5, orderBy = 'newest') => {
    const result = await api.get(`/tracks/${parentTrackId}/related-around`, { params: { targetId: targetTrackId, limit, orderBy } });
    return result.data;
  }

  setChildrenTracks = (id, children, paginationData) => {
    if (children && children.length > 0) {
      // Store tracks in trackData
      children.forEach(child => {
        this.trackData.set(child.id, child);
      });
      
      // Save children into a TracksWindow for this parent, merging overlaps and deduping.
      // NOTE: The API returns children ordered newest->oldest for orderBy='newest' (default).
      const existingWindows = this.trackWindowsForParent.get(id) || [];
      const newWindow = new TracksWindow(children, paginationData);

      const intersects = (a, b) => {
        if (!a || !b) return false;

        const toMillis = (v) => {
          if (!v) return null;
          if (v instanceof Date) return v.getTime();
          const d = new Date(v);
          const t = d.getTime();
          return Number.isNaN(t) ? null : t;
        };

        // Compare by created_at then id (matches API pagination ordering).
        // Returns -1 if x<y, 0 if equal, 1 if x>y.
        const cmp = (x, y) => {
          if (!x || !y) return 0;
          const tx = toMillis(x.createdAt);
          const ty = toMillis(y.createdAt);
          if (tx == null || ty == null) return 0;
          if (tx < ty) return -1;
          if (tx > ty) return 1;
          const ix = Number(x.id);
          const iy = Number(y.id);
          if (Number.isFinite(ix) && Number.isFinite(iy)) {
            if (ix < iy) return -1;
            if (ix > iy) return 1;
          }
          return 0;
        };

        const newestBound = (win) => {
          const start = { createdAt: win.getStartCreatedAt?.(), id: win.getStartId?.() };
          const nextNewest = { createdAt: win.getNextNewestCreatedAt?.(), id: win.getNextNewestTrackId?.() };
          if (nextNewest.createdAt && nextNewest.id != null && cmp(nextNewest, start) > 0) return nextNewest;
          return start;
        };

        const oldestBound = (win) => {
          const end = { createdAt: win.getEndCreatedAt?.(), id: win.getEndId?.() };
          const nextOldest = { createdAt: win.getNextOldestCreatedAt?.(), id: win.getNextOldestTrackId?.() };
          if (nextOldest.createdAt && nextOldest.id != null && cmp(nextOldest, end) < 0) return nextOldest;
          return end;
        };

        const aMin = oldestBound(a);
        const aMax = newestBound(a);
        const bMin = oldestBound(b);
        const bMax = newestBound(b);

        // Overlap if ranges are not strictly disjoint.
        return cmp(aMax, bMin) >= 0 && cmp(bMax, aMin) >= 0;
      };

      const mergeWindowsPreserveOrder = (primary, secondary) => {
        const seen = new Set();
        const mergedTracks = [];
        const pushUnique = (track) => {
          if (!track || seen.has(track.id)) return;
          seen.add(track.id);
          mergedTracks.push(track);
        };
        primary.tracks.forEach(pushUnique);
        secondary.tracks.forEach(pushUnique);
        
        // Ensure newest -> oldest order after merge (API default orderBy='newest').
        const toMillis = (v) => {
          if (!v) return null;
          if (v instanceof Date) return v.getTime();
          const d = new Date(v);
          const t = d.getTime();
          return Number.isNaN(t) ? null : t;
        };

        mergedTracks.sort((a, b) => {
          const ta = toMillis(a?.created_at);
          const tb = toMillis(b?.created_at);
          if (ta != null && tb != null && ta !== tb) return tb - ta; // desc
          const ia = Number(a?.id);
          const ib = Number(b?.id);
          if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ib - ia; // desc
          return 0;
        });

        // Preserve pagination cursors from the "newest" window and the "oldest" window.
        // nextNewest belongs to the newest-start window; nextOldest belongs to the oldest-end window.
        const startPrimary = toMillis(primary?.getStartCreatedAt?.());
        const startSecondary = toMillis(secondary?.getStartCreatedAt?.());
        const endPrimary = toMillis(primary?.getEndCreatedAt?.());
        const endSecondary = toMillis(secondary?.getEndCreatedAt?.());

        const newestStartWin =
          startPrimary != null && startSecondary != null
            ? (startPrimary >= startSecondary ? primary : secondary)
            : (primary?.getStartCreatedAt?.() ? primary : secondary);

        const oldestEndWin =
          endPrimary != null && endSecondary != null
            ? (endPrimary <= endSecondary ? primary : secondary)
            : (primary?.getEndCreatedAt?.() ? primary : secondary);

        return new TracksWindow(mergedTracks, {
          nextNewestTrackId: newestStartWin?.getNextNewestTrackId?.(),
          nextNewestCreatedAt: newestStartWin?.getNextNewestCreatedAt?.(),
          nextOldestTrackId: oldestEndWin?.getNextOldestTrackId?.(),
          nextOldestCreatedAt: oldestEndWin?.getNextOldestCreatedAt?.(),
        });
      };

      let mergedWindow = newWindow;
      const nonOverlapping = [];
      for (const win of existingWindows) {
        if (intersects(win, mergedWindow)) {
          mergedWindow = mergeWindowsPreserveOrder(win, mergedWindow);
        } else {
          nonOverlapping.push(win);
        }
      }

      this.trackWindowsForParent.set(id, [...nonOverlapping, mergedWindow]);

      // Update pagination data based on the window-array boundary cursors.
      this.updatePaginationDataForParent(id);

      this.recordUsage({tracks: children, rendered: false});
      
      // Remove fetched children from newKidsAvailable map if present
      const fetchedChildIds = new Set(children.map(child => child.id));
      const currentNewKids = this.newKidsAvailable.get(id);
      if (currentNewKids && currentNewKids.length > 0) {
        const remainingTracks = currentNewKids.filter(t => !fetchedChildIds.has(t.id));
        if (remainingTracks.length > 0) {
          this.newKidsAvailable.set(id, remainingTracks);
        } else {
          this.newKidsAvailable.delete(id);
        }
      }
    }
    else if (children && children.length === 0) {
      const existingWindows = this.trackWindowsForParent.get(id);
      if (existingWindows === undefined) {
        this.trackWindowsForParent.set(id, []); // empty array means no children exist
      }
      this.updatePaginationDataForParent(id);
    }
  }

  fetchAndSetChildren = async (trackId, lastId = null, orderBy = 'newest') => {
    const result = await this.fetchChildren(trackId, lastId, orderBy);
    const {id, data} = result;
    this.setChildrenTracks(id, data.tracks, data.pagination);
    return data.tracks;
  }

  fetchAndSetSiblingTracksAroundTarget = async (trackId, targetTrackId, limit = 5, orderBy = 'newest') => {
    const data = await this.fetchSiblingTracksAroundTarget(trackId, targetTrackId, limit, orderBy);
    this.setChildrenTracks(trackId, data.tracks, data.pagination);
    return data.tracks;
  }

  // Recompute pagination for a parent based on boundary window cursors.
  // - If the newest window advertises a next-newest track, then hasNewer=true.
  // - If the oldest window advertises a next-oldest track, then hasOlder=true.
  updatePaginationDataForParent = (parentTrackId) => {
    const windows = this.trackWindowsForParent.get(parentTrackId);
    if (windows === undefined) {
      this.paginationData.delete(parentTrackId);
      return;
    }

    if (windows.length === 0) {
      this.paginationData.set(
        parentTrackId,
        new PaginationData(null, null, false, false)
      );
      return;
    }

    // Assume windows are already ordered newest -> oldest.
    const firstWindow = windows[0];
    const lastWindow = windows[windows.length - 1];

    const newestKnownTrackId = firstWindow?.getStartId?.() ?? null;
    const oldestKnownTrackId = lastWindow?.getEndId?.() ?? null;

    const hasNewer = Boolean(firstWindow?.getNextNewestTrackId?.());
    const hasOlder = Boolean(lastWindow?.getNextOldestTrackId?.());

    this.paginationData.set(
      parentTrackId,
      new PaginationData(oldestKnownTrackId, newestKnownTrackId, hasOlder, hasNewer)
    );
  }



  fetchTrackTree = async (trackId, init = true) => {      

    const url = this.secret 
      ? `/tracks/${trackId}/tree?secret=${this.secret}`
      : `/tracks/${trackId}/tree`;
    
    const response = await api.get(url);
    const trackTree = response.data; // [ancestors, current]
    
    if (trackTree.length === 0) {
      throw new Error('Track not found');
    }

    // Store all tracks in trackData
    trackTree.forEach(track => {
      this.trackData.set(track.id, track);
    });

    if(init) {
      // Set root track id
      this.rootTrackId = trackTree[0].id;

      // Only initialize children windows for the current (last) track in the path.
      // Ancestor windows are populated just-in-time via the around-target fetches below.
      const currentTrack = trackTree[trackTree.length - 1];
      await this.fetchAndSetChildren(currentTrack.id, null);
      this.recordUsage({tracks: this.trackData.values(), rendered: false});
    }
  } 

  ensureAllAncestorsAreLoaded = async (trackId) => {
    let allLoaded = false;
    let currentTrackId = trackId;
    while(currentTrackId) {
      const currentTrack = this.trackData.get(currentTrackId);
      if(!currentTrack) {
        break;
      }
      currentTrackId = currentTrack.parent_track_id;
      if(!currentTrackId){ // root track
        allLoaded = true;
        break;
      }
    }
    if(!allLoaded) {
      await this.fetchTrackTree(trackId, false);
    }
  }

  getChildren = async (trackId, limit = 5, lastId = null, orderBy = 'newest') => {
    const paginationData = this.paginationData.get(trackId);

    if (lastId) {
      const window = this.getWindowContainingTrack(trackId, lastId);
      const tracks = window.getTracks();
      const index = tracks.findIndex(track => track.id === lastId);

      // check if we have all the tracks we need and return them if so
      if (index !== -1) {
        if(orderBy === 'newest') {
          if(tracks.length - index >= limit) {
            return tracks.slice(index + 1, index + 1 + limit);
          }
        } else {
          if(index + 1 >= limit) {
            return tracks.slice(index - limit + 1, index + 1);
          }
        }
      }

      // if we don't have all the tracks we need, fetch the next window
      if(orderBy === 'newest') {
        const newTracks = await this.fetchAndSetChildren(trackId, window.getEndId(), orderBy);
        return newTracks.slice(0, limit - tracks.length + index + 1);

      } else {
        const newTracks = await this.fetchAndSetChildren(trackId, window.getStartId(), orderBy);
        return newTracks.slice(0, limit - tracks.length + index + 1).reverse();
      }
    }


    // this code assumes orderBy is newest

    // If there are newer tracks available than our newest window knows about,
    // refresh from the newest cursor (lastId=null).
    let needToFetch = false;
    if(paginationData && !paginationData.getHasNewer() && !paginationData.getHasOlder()) 
    {
      const windows = this.trackWindowsForParent.get(trackId);

      // track has no children
      if(windows !== undefined)
      {
        if(windows.length === 0)
        {
          return [];
        }
      }
    }
    if (!paginationData || paginationData.getHasNewer()) {
      needToFetch = true;
    }
    else {
      const windows = this.trackWindowsForParent.get(trackId) || [];
      const firstWindow = windows?.[0];
      const firstWindowTracks = firstWindow?.getTracks?.() || [];

      // Windows are stored newest -> oldest, so the first window must contain
      // the newest `limit` tracks if we already have everything needed.
      // if we don't have all the tracks we need, and there are more older tracks available, fetch the next window
      const hasAllNeededTracks = firstWindowTracks.length >= limit;
      if (!hasAllNeededTracks && firstWindow.getNextOldestTrackId()) {
        needToFetch = true;
      }
    }

    if(needToFetch) {
      await this.fetchAndSetChildren(trackId, null);
    }

    const updatedWindows = this.trackWindowsForParent.get(trackId) || [];
    const tracks = updatedWindows?.[0]?.getTracks?.() || [];
    return tracks.slice(0, limit);
  }

  getNextSibling = async (parentTrackId, lastId = null) => {
    if (!parentTrackId) return null;

    let windows = this.trackWindowsForParent.get(parentTrackId);
    if (!windows) {
      throw new Error('Unexpected error: No windows found for parent track id when at least one child already exists');
    }

    // If no cursor is provided, return the newest child (first item in newest window).
    if (lastId == null) {
      throw new Error('Unexpected error: LastId is null');
    }

    for (const win of windows || []) {
      const tracks = win?.getTracks?.() || [];
      const idx = tracks.findIndex(t => String(t?.id) === String(lastId));
      if (idx === -1) continue;

      // Tracks are stored newest -> oldest, so the next older sibling is idx+1.
      if (idx < tracks.length - 1) {
        return tracks[idx + 1] || null;
      }

      // We're at the end of the window (oldest in this window). If more older tracks exist,
      // fetch the next page and return the first track (next older sibling).
      const hasOlder = Boolean(win?.getNextOldestTrackId?.());
      if (!hasOlder) {
        return null;
      }

      const newTracks = await this.fetchAndSetChildren(parentTrackId, win?.getEndId?.());
      return newTracks?.[0] || null;
    }

    throw new Error('Unexpected error: lastId not found in any window');
  }

  getSiblingTracksAroundTarget = async (trackId, targetTrackId, limit = 5) => {
    const getWindowContainingTarget = () => {
      const windows = this.trackWindowsForParent.get(trackId) || [];
      if (!windows || windows.length === 0) return null;

      for (const win of windows) {
        const winTracks = win?.getTracks?.() || [];
        const hasTarget = winTracks.some(t => String(t?.id) === String(targetTrackId));
        if (hasTarget) return win;
      }
      return null;
    };

    const maybeFetch = async () => {
      const win = getWindowContainingTarget();
      if (!win) return true;

      const loaded = win?.getTracks?.() || [];
      const targetIdx = loaded.findIndex(t => String(t?.id) === String(targetTrackId));
      if (targetIdx === -1) return true; // defensive; should not happen if win matched

      const newerLoaded = targetIdx;
      const olderLoaded = loaded.length - targetIdx - 1;
      const needsNewer = newerLoaded < limit && Boolean(win?.getNextNewestTrackId?.());
      const needsOlder = olderLoaded < limit && Boolean(win?.getNextOldestTrackId?.());
      return needsNewer || needsOlder;
    };

    const shouldFetch = await maybeFetch();
    if (shouldFetch) {
      await this.fetchAndSetSiblingTracksAroundTarget(trackId, targetTrackId, limit);
    }

    const finalWindow = getWindowContainingTarget();
    const finalLoaded = finalWindow?.getTracks?.() || [];
    const idx = finalLoaded.findIndex(t => String(t?.id) === String(targetTrackId));
    if (idx === -1) return [];

    return sliceTracksAroundIndex(finalLoaded, idx, limit);
  }


  // gets tracks between and including startId and endId. all tracks must be loaded and in the same window,
  // if not, it will throw an error
  getChildrenRange = (trackId, startId, endId) => {
    if(!startId || !endId) {
      return [];
    }
    const window = this.getWindowContainingRange(trackId, startId, endId);
    const tracks = window.getTracks();
    const startIndex = tracks.findIndex(track => track.id === startId);
    const endIndex = tracks.findIndex(track => track.id === endId);
    if(startIndex === -1 || endIndex === -1) {
      throw new Error('Unexpected error: StartId or endId not found in any window');
    }
    return tracks.slice(startIndex, endIndex + 1);
  }

  // positive shiftBy means older tracks, negative shiftBy means newer tracks
  // loadMoreTracksIfNeeded = async (trackId, lastId, shiftBy = 0, limit = 5) => {
  //   const window = this.getWindowContainingTrack(trackId, lastId);
  //   const tracks = window.getTracks();
  //   const startIndex = tracks.findIndex(track => track.id === lastId);
  //   const endIndex = startIndex + shiftBy;
  //   if(endIndex < 0) {
  //     if(window.getNextNewestTrackId()) {
  //       const lastId = window.getStartId();
  //       return await this.getChildren(trackId, limit, lastId, 'oldest');
  //     }
  //     return []; // cant load more tracks, no more newer tracks available
  //   }
  //   else if(endIndex >= tracks.length) {
  //     if(window.getNextOldestTrackId()) {
  //       const lastId = window.getEndId();
  //       return await this.getChildren(trackId, limit, lastId, 'newest');
  //     }
  //     return []; // cant load more tracks, no more older tracks available
  //   }
  // }

  shiftWindow = async (trackId, startId, endId, shiftBy = 0, limit = 5) => {
    if (Math.abs(shiftBy) > 1) {
      throw new Error('Unexpected error: ShiftBy is greater than 1');
    }
    if (shiftBy === 0) {
      return { shifted: false, startId, endId };
    }

    const resolveRangeIndices = (win) => {
      const t = win.getTracks();
      const si = t.findIndex((track) => track.id === startId);
      const ei = t.findIndex((track) => track.id === endId);
      if (si === -1 || ei === -1) {
        throw new Error('Unexpected error: StartId or endId not found in any window');
      }
      return { tracks: t, startIndex: si, endIndex: ei };
    };

    let window = this.getWindowContainingRange(trackId, startId, endId);
    let { tracks, startIndex, endIndex } = resolveRangeIndices(window);

    const noShift = () => ({ shifted: false, startId, endId });
    const shifted = () => ({
      shifted: true,
      startId: tracks[startIndex + shiftBy].id,
      endId: tracks[endIndex + shiftBy].id,
    });

    // positive shiftBy => move selection one step toward older (higher index)
    if (shiftBy > 0) {
      if (endIndex + shiftBy >= tracks.length) {
        if (!window.getNextOldestTrackId()) {
          return noShift();
        }
        await this.fetchAndSetChildren(trackId, window.getEndId(), 'newest');
        window = this.getWindowContainingRange(trackId, startId, endId);
        ({ tracks, startIndex, endIndex } = resolveRangeIndices(window));
        if (endIndex + shiftBy >= tracks.length) {
          return noShift();
        }
      }
      return shifted();
    }

    // negative shiftBy => move selection one step toward newer (lower index)
    if (startIndex + shiftBy < 0) {
      if (!window.getNextNewestTrackId()) {
        return noShift();
      }
      await this.fetchAndSetChildren(trackId, window.getStartId(), 'oldest');
      window = this.getWindowContainingRange(trackId, startId, endId);
      ({ tracks, startIndex, endIndex } = resolveRangeIndices(window));
      if (startIndex + shiftBy < 0) {
        return noShift();
      }
    }
    return shifted();
  }

  //recursive function that returns an array of track ids from the root to the given track id
  getAncestors = (trackId) => {
    const ancestors = [];
    let currentTrackId = trackId;
    while(currentTrackId) {
      ancestors.push(currentTrackId);
      const currentTrack = this.trackData.get(currentTrackId);
      if (!currentTrack) {
        break;
      }
      currentTrackId = currentTrack.parent_track_id;
    }
    return ancestors;
  }

  // Returns an array of track IDs from root to the given track ID following parent-child relationships
  getTrackPath = (trackId) => {
    if (!trackId || !this.trackData.has(trackId)) {
      return [];
    }
    // getAncestors returns [trackId, parentId, ..., rootId]
    // Reverse to get [rootId, ..., parentId, trackId]
    const ancestors = this.getAncestors(trackId);
    return ancestors.reverse();
  }

  recordUsage = ({trackId, trackIds, tracks, nodes, rendered, setTimestamp = true}) => {
    const tracksToUpdate = new Set();
    
    // Collect all track IDs that need to be marked as used
    if(trackId) {
      tracksToUpdate.add(trackId);
    }
    if(tracks) {
      tracks.forEach(track => {
        tracksToUpdate.add(track.id);
      });
    }
    if(trackIds) {
      trackIds.forEach(trackId => {
        tracksToUpdate.add(trackId);
      });
    }
    if(nodes) {
      nodes.forEach(node => {
        if(node.type === 'trackNode') {
          tracksToUpdate.add(node.data.track.id);
        }
      });
    }

    if(!setTimestamp) {
      // Only update existing usage entries to set the rendered flag
      tracksToUpdate.forEach(id => {
        const existingUsage = this.usageData.get(id);
        if (existingUsage) {
          existingUsage.rendered = rendered;
        }
      });
      return;
    }

    // For each track, also collect all its ancestors
    const allTracksToUpdate = new Set(tracksToUpdate);
    tracksToUpdate.forEach(id => {
      // Only get ancestors if the track exists in trackData
      if (this.trackData.has(id)) {
        const ancestors = this.getAncestors(id);
        ancestors.forEach(ancestorId => {
          allTracksToUpdate.add(ancestorId);
        });
      }
    });
    
    // Mark all tracks (original + ancestors) as used in a single pass
    const now = new Date();
    allTracksToUpdate.forEach(id => {
      this.usageData.set(id, {rendered: rendered, lastAccessed: now});
    });
  }

  // Gets the next track after trackId doing depth first search
  // Now async to support lazy loading of paginated children
  getNextTrack = async (trackId) => {
    if (!trackId) {
      return null;
    }
    
    const track = this.trackData.get(trackId);
    if(!track) {
      throw new Error('Unexpected error: Track not found');
    }
    else if((track.collab_count || 0) > 0){
      const children = await this.getChildren(trackId, 1);
      if(children && children.length > 0) {
        return children[0].id;
      }
    }


    // No children available, move to sibling traversal
    const getNextSiblingOrParentSiblingRecursive = async (currentTrackId) => {
      if (!currentTrackId || currentTrackId === this.rootTrackId) {
        return null;
      }

      const currentTrack = this.trackData.get(currentTrackId);
      if (!currentTrack || !currentTrack.parent_track_id) {
        return null;
      }

      const parentId = currentTrack.parent_track_id;

      const nextSibling = await this.getNextSibling(parentId, currentTrackId);
      if(nextSibling) {
        return nextSibling.id;
      }
      
      // No more siblings available, recurse to parent
      return getNextSiblingOrParentSiblingRecursive(parentId);
    }
    
    return getNextSiblingOrParentSiblingRecursive(trackId);
  }

  // Mark a trackId as having new kids available (append full track objects)
  markNewKidsAvailable = (trackId, newTracks) => {
    if (trackId && newTracks && newTracks.length > 0) {
      const currentTracks = this.newKidsAvailable.get(trackId) || [];
      const existingIds = new Set(currentTracks.map(t => t.id));
      const uniqueNewTracks = newTracks.filter(t => t?.id != null && !existingIds.has(t.id));
      if (uniqueNewTracks.length > 0) {
        this.newKidsAvailable.set(trackId, [...currentTracks, ...uniqueNewTracks]);
      }
      const paginationData = this.paginationData.get(trackId);
      if(paginationData) {
        paginationData.setHasNewer(true);
      }

      const windows = this.trackWindowsForParent.get(trackId);
      if(windows) {
        const firstWindow = windows[0];
        if(firstWindow) {
          if(!firstWindow.getNextNewestTrackId() && !firstWindow.getNextNewestCreatedAt()) {
            const oldestNewTrack = uniqueNewTracks.sort((a, b) => a.created_at - b.created_at)[0];
            firstWindow.setNextNewestTrackId(oldestNewTrack.id);
            firstWindow.setNextNewestCreatedAt(oldestNewTrack.created_at);
          }
        }
      }
    }
  }

  // Check if a trackId has new kids available
  hasNewKidsAvailable = (trackId) => {
    const newKids = this.newKidsAvailable.get(trackId) || [];
    return newKids.length > 0;
  }

  // Get the count of new kids available for a trackId
  getNewKidsCount = (trackId) => {
    const newKids = this.newKidsAvailable.get(trackId) || [];
    return newKids.length;
  }

  // Clear the new kids flag for a trackId (e.g., when they load the new kids)
  clearNewKidsAvailable = (trackId) => {
    if (trackId) {
      this.newKidsAvailable.delete(trackId);
    }
  }

};

