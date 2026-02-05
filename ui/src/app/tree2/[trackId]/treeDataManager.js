
import api from '../../../lib/api';
import { MAX_NODES_PER_LEVEL } from './config';


export class TreeDataManager {
  constructor(secret) {
    this.trackData = new Map();
    this.childrenData = new Map();
    this.paginationData = new Map();
    this.rootTrackId = null;
    this.testMode = true;
    this.secret = secret;
  }

  // Fetch children for a track
  fetchChildren = async (parentTrackId) => {
    let data = null;
    if (this.testMode) {

      const response = await api.get(`/tracks/${parentTrackId}/related-test`, {
        params: {
          page: 1,
          limit: MAX_NODES_PER_LEVEL,
          includeChildCount: true,
          includeParent: false
        }
      });
      data = response.data;
    }
    else {
      const response = await api.get(`/tracks/${parentTrackId}/related`, {
        params: {
          page: 1,
          limit: MAX_NODES_PER_LEVEL,
          includeChildCount: true,
          includeParent: false
        }
      });
      data = response.data;
    }
    return {id: parentTrackId, data: data};
  }

  fetchAndSetChildren = async (trackId) => {
    const result = await this.fetchChildren(trackId);
    const {id, data} = result;
    const children = data.tracks;
    if (children && children.length > 0) {
      children.forEach(child => {
        this.trackData.set(child.id, child);
      });
      this.childrenData.set(id, children);
      this.paginationData.set(id, data.pagination);
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
        return this.fetchChildren(track.id);
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
};

