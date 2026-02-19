
import api from '../../../../lib/api';
import { MAX_NODES_PER_LEVEL, PRUNING_METHOD, MAX_VISIBLE_NODES, PRUNING_METHODS } from './config';


export class TreeDataManager {
  constructor(secret) {
    this.trackData = new Map();
    this.childrenData = new Map();
    this.paginationData = new Map();
    this.usageData = new Map();
    this.newKidsAvailable = new Set(); // Track which trackIds have new children to load
    this.rootTrackId = null;
    this.testMode = true;
    this.secret = secret;
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

  fetchAndSetChildren = async (trackId, lastId = null) => {
    const result = await this.fetchChildren(trackId, lastId);
    const {id, data} = result;
    const children = data.tracks;
    if (children && children.length > 0) {
      // Store tracks in trackData
      children.forEach(child => {
        this.trackData.set(child.id, child);
      });
      
      // Append children instead of overwriting
      const existingChildren = this.childrenData.get(id) || [];
      const existingChildIds = new Set(existingChildren.map(child => child.id));
      
      // Only add children that don't already exist (avoid duplicates)
      const newChildren = children.filter(child => !existingChildIds.has(child.id));
      
      if (newChildren.length > 0) {
        this.childrenData.set(id, [...existingChildren, ...newChildren]);
      }
      
      // Update pagination data (always use latest from API)
      this.paginationData.set(id, data.pagination);
      this.recordUsage({tracks: newChildren, rendered: false});
    }
    else if (children && children.length === 0) {
      const existingChildren = this.childrenData.get(id)
      if(existingChildren === undefined) {
        this.childrenData.set(id, []); // empty array means no children exist
      }
    }
  }



  fetchTrackTree = async (trackId) => {      

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

    // Set selected track to the current track (last in array)
    const currentTrack = trackTree[trackTree.length - 1];

    // Set root track id
    this.rootTrackId = trackTree[0].id;

    // Fetch children for all tracks in the tree
    const allChildrenData = await Promise.all(
      trackTree.map(track => {
        return this.fetchChildren(track.id, null);
      })
    );

    // Store all children in childrenData
    allChildrenData.forEach(childData => {
      const {id, data} = childData;
      const children = data.tracks;
      if (children.length > 0) {
        children.forEach(child => {
          this.trackData.set(child.id, child);
        });
        this.childrenData.set(id, children);
        this.paginationData.set(id, data.pagination);
      }
    });

    this.recordUsage({tracks: this.trackData.values(), rendered: false});

    // Ensure parent->child relationships from trackTree are included in childrenData
    for (let i = 1; i < trackTree.length; i++) {
      const childTrack = trackTree[i];
      const parentTrack = trackTree[i - 1];
      const parentId = parentTrack.id;
      
      // Get existing children for this parent, or create new array
      const existingChildren = this.childrenData.get(parentId) || [];
      
      // Check if this child is already in the children array
      const childExists = existingChildren.some(child => child.id === childTrack.id);
      
      if (!childExists) {
        // Add this child to the parent's children array
        this.childrenData.set(parentId, [...existingChildren, childTrack]);
      }
    }
  } 

  //recursive function that returns an array of track ids from the root to the given track id
  getAncestors = (trackId) => {
    const ancestors = [];
    let currentTrackId = trackId;
    while(currentTrackId) {
      ancestors.push(currentTrackId);
      currentTrackId = this.trackData.get(currentTrackId).parent_track_id;
    }
    return ancestors;
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


  // Check if a node is a leaf (has no rendered children)
  isLeafNode = (trackId) => {
    const children = this.childrenData.get(trackId);
    if (!children || children.length === 0) {
      return true;
    }
    // Check if any child is rendered
    return !children.some(child => {
      const usage = this.usageData.get(child.id);
      return usage && usage.rendered;
    });
  }

  // Helper: Check if more children pages exist for a parent
  hasMoreChildrenPages = (parentTrackId) => {
    const pagination = this.paginationData.get(parentTrackId);
    if (!pagination || pagination.hasMore === undefined) {
      return false;
    }
    
    return pagination.hasMore === true;
  }

  // Helper: Get the last track ID to use as cursor for next page load
  getLastTrackId = (parentTrackId) => {
    const loadedChildren = this.childrenData.get(parentTrackId) || [];
    if (loadedChildren.length === 0) {
      return null;
    }
    // Return the ID of the last child track (for cursor-based pagination)
    return loadedChildren[loadedChildren.length - 1].id;
  }

  // Helper: Check if a track has children (either loaded or available via pagination)
  hasChildren = (trackId) => {
    const loadedChildren = this.childrenData.get(trackId);
    if (loadedChildren && loadedChildren.length > 0) {
      return true;
    }
    if(loadedChildren && loadedChildren.length === 0) {
      return false; 
    }
    return null;
  }

  // Gets the next track after trackId doing depth first search
  // Now async to support lazy loading of paginated children
  getNextTrack = async (trackId) => {
    if (!trackId) {
      return null;
    }
    
    if (this.hasChildren(trackId) === null) { // we don't know if it has children yet, attempt to fetch
      await this.fetchAndSetChildren(trackId, null);
    }
    if (this.hasChildren(trackId) === true) {
      return this.childrenData.get(trackId)[0].id;
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
      const siblings = this.childrenData.get(parentId) || [];
      
      // Find current track's index in siblings
      const siblingIndex = siblings.findIndex(sibling => sibling.id === currentTrackId);
      
      // Check if there's a next sibling in loaded children
      if (siblingIndex >= 0 && siblingIndex < siblings.length - 1) {
        return siblings[siblingIndex + 1].id;
      }
      
      // No next sibling in loaded children, check if more pages exist
      if (this.hasMoreChildrenPages(parentId)) {
        const lastId = this.getLastTrackId(parentId);
        await this.fetchAndSetChildren(parentId, lastId);
        
        // Re-fetch siblings after loading new page
        const updatedSiblings = this.childrenData.get(parentId) || [];
        const updatedSiblingIndex = updatedSiblings.findIndex(sibling => sibling.id === currentTrackId);
        
        if (updatedSiblingIndex >= 0 && updatedSiblingIndex < updatedSiblings.length - 1) {
          return updatedSiblings[updatedSiblingIndex + 1].id;
        }
      }
      
      // No more siblings available, recurse to parent
      return getNextSiblingOrParentSiblingRecursive(parentId);
    }
    
    return getNextSiblingOrParentSiblingRecursive(trackId);
  }

  pruneTree = () => {
    const idsToPrune = new Set();

    if (PRUNING_METHOD === PRUNING_METHODS.TOTAL_NODES_EXCEEDED) {
      // Get all rendered nodes
      const renderedNodes = [];
      for (const [trackId, usage] of this.usageData.entries()) {
        if (usage.rendered) {
          renderedNodes.push({ trackId, lastAccessed: usage.lastAccessed });
        }
      }

      console.log('renderedNodes', renderedNodes.length, 'of', MAX_VISIBLE_NODES);

      // Check if we exceed max visible nodes
      if (renderedNodes.length <= MAX_VISIBLE_NODES) {
        return idsToPrune;
      }

      // Pre-filter to prunable non-leaf nodes once (layer > 1 and is not leaf), ordered by LRU first
      const prunableNodes = renderedNodes.filter(node => {
        const track = this.trackData.get(node.trackId);
        if (!track) return false;
        
        const layer = track?.layer ?? 0;
        if (layer === 0) return false;
        
        return !this.isLeafNode(node.trackId);
      }).sort((a, b) => {
        // Sort by LRU first (oldest lastAccessed first)
        const lruDiff = a.lastAccessed - b.lastAccessed;
        if (lruDiff !== 0) return lruDiff;
        
        // Then by layer (higher layers first)
        const trackA = this.trackData.get(a.trackId);
        const trackB = this.trackData.get(b.trackId);
        const layerA = trackA?.layer ?? 0;
        const layerB = trackB?.layer ?? 0;
        return layerB - layerA;
      });

      if (prunableNodes.length === 0) {
        return idsToPrune;
      }

      console.log('prunableNodes', prunableNodes.length);

      while(renderedNodes.length - idsToPrune.size > MAX_VISIBLE_NODES) {
        if (prunableNodes.length === 0) {
          break;
        }
        
        const prunableNode = prunableNodes.shift();
        const children = this.childrenData.get(prunableNode.trackId);
        
        if (children && children.length > 0) {
          children.forEach(child => {
            idsToPrune.add(child.id);
            console.log('pruned child', child.id);
          });
        }
      }

    }

    return idsToPrune;
  }

  // Mark a trackId as having new kids available
  markNewKidsAvailable = (trackId) => {
    if (trackId) {
      this.newKidsAvailable.add(trackId);
    }
  }

  // Check if a trackId has new kids available
  hasNewKidsAvailable = (trackId) => {
    return this.newKidsAvailable.has(trackId);
  }

  // Clear the new kids flag for a trackId (e.g., when they load the new kids)
  clearNewKidsAvailable = (trackId) => {
    if (trackId) {
      this.newKidsAvailable.delete(trackId);
    }
  }

  // Fetch and set new children (older children that were added before the currently loaded ones)
  fetchAndSetNewChildren = async (trackId) => {
    const existingChildren = this.childrenData.get(trackId) || [];
    
    let firstChildId = null;

    // Get the first (oldest) child's ID to use as cursor
    if(existingChildren.length > 0) {
      firstChildId = existingChildren[0].id;
    }

    // Fetch children with oldest first ordering, using first child ID as cursor
    const result = await this.fetchChildren(trackId, firstChildId, 'oldest');
    const {id, data} = result;
    const newChildren = data.tracks;

    if (newChildren && newChildren.length > 0) {
      // Store tracks in trackData
      newChildren.forEach(child => {
        this.trackData.set(child.id, child);
      });
      
      // Prepend new children to the beginning of the array (they're older)
      const existingChildIds = new Set(existingChildren.map(child => child.id));
      
      // Only add children that don't already exist (avoid duplicates)
      const uniqueNewChildren = newChildren.filter(child => !existingChildIds.has(child.id));
      
      if (uniqueNewChildren.length > 0) {
        // Reverse to maintain newest-to-oldest order (API returns oldest-to-newest with orderBy='oldest')
        const reversedNewChildren = uniqueNewChildren.reverse();
        this.childrenData.set(id, [...reversedNewChildren, ...existingChildren]);
      }
      
      this.recordUsage({tracks: uniqueNewChildren, rendered: false});
    }

    // Check if there are still more children available
    const pagination = data.pagination;
    if (!pagination || !pagination.hasMore) {
      // No more children, remove from newKidsAvailable set
      this.clearNewKidsAvailable(trackId);
    }
    // If hasMore is true, leave it in the set (still has new kids)
  }
};

