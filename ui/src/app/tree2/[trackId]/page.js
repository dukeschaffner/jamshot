'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import api from '../../../lib/api';
import LoadingSpinner from '../../../components/LoadingSpinner';
import TrackNode from './components/TrackNode';
import ClusterNode from './components/ClusterNode';
import TrackPopover from './components/TrackPopover';
import ColorLegend from './components/ColorLegend';
import { useAudio } from '../../../lib/AudioContext';
import { useMobile } from '../../../contexts/MobileContext';
import { generateHierarchicalTreeNodesAndEdges } from './hierarchicalTreeRenderer';
import styles from './TreeView.module.css';

// Configuration constants
const MAX_NODES_PER_LEVEL = 20;
const MAX_VISIBLE_NODES = 50;
const MAX_LEVELS = 5;

// Node types
const nodeTypes = {
  trackNode: TrackNode,
  clusterNode: ClusterNode,
};

export default function TrackTreePage() {
  const { trackId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const { isMobile } = useMobile();
  const { currentTrack, playTrack, togglePlayPause, isPlaying } = useAudio();

  const [trackData, setTrackData] = useState(new Map()); // trackId -> track data
  const [childrenData, setChildrenData] = useState(new Map()); // trackId -> children array
  const [paginationData, setPaginationData] = useState(new Map()); // trackId -> pagination data
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [hoveredTrackId, setHoveredTrackId] = useState(null);
  const [hoveredNodePosition, setHoveredNodePosition] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const isInternalNavigationRef = useRef(false);
  const lastLoadedTrackGuidRef = useRef(null);

  const testMode = true;

  // Fetch children for a track
  const fetchChildren = useCallback(async (parentTrackId) => {
    try {
      let data = null;
      if (testMode) {

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


      const { tracks, pagination } = data;

      // Store pagination data
      setPaginationData(prev => new Map(prev).set(parentTrackId, pagination));

      return tracks;
    } catch (err) {
      console.error(`Failed to fetch children for track ${parentTrackId}:`, err);
    }
  }, [trackData]);

  // Check if mobile - redirect to old tree view
  useEffect(() => {
    if (!isMobile && isMobile !== undefined) {
      // Desktop only - continue
    } else if (isMobile) {
      // Redirect to old tree view on mobile
      router.replace(`/tree/${trackId}${secret ? `?secret=${secret}` : ''}`);
    }
  }, [isMobile, trackId, secret, router]);

  // Fetch initial track tree (ancestors + current track)
  // NOTE: This only runs when trackId from useParams() changes (initial load or external navigation)
  // Internal node clicks use window.history.pushState() which doesn't change trackId, so this won't run
  useEffect(() => {
    const fetchTrackTree = async () => {      
      // Skip if we already loaded this exact track (shouldn't happen often, but safety check)
      if (lastLoadedTrackGuidRef.current === trackId && trackData.size > 0) {
        return;
      }

      try {
        setLoading(true);
        const url = secret 
          ? `/tracks/${trackId}/tree?secret=${secret}`
          : `/tracks/${trackId}/tree`;
        
        const response = await api.get(url);
        const trackTree = response.data; // [ancestors, current]
        
        if (trackTree.length === 0) {
          setError('Track not found');
          return;
        }

        // Store all tracks in trackData
        const newTrackData = new Map(trackData);
        trackTree.forEach(track => {
          newTrackData.set(track.id, track);
        });

        // Set selected track to the current track (last in array)
        const currentTrack = trackTree[trackTree.length - 1];

        // Fetch children for all tracks in the tree
        const allChildrenData = await Promise.all(
          trackTree.map(track => {
            return fetchChildren(track.id);
          })
        );

        // Store all children in childrenData
        const newChildrenData = new Map(childrenData);
        allChildrenData.forEach(children => {
          if (children.length > 0) {
            children.forEach(child => {
              newTrackData.set(child.id, child);
            });
            newChildrenData.set(children[0].parent_track_id, children);
          }
        });

        // Set all state once with the complete data
        setTrackData(newTrackData);
        setChildrenData(newChildrenData);
        setSelectedTrackId(currentTrack.id);
        lastLoadedTrackGuidRef.current = trackId;
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch track tree:', err);
        if (err.response && err.response.status === 403) {
          setError('This track is private. You do not have permission to view it.');
        } else {
          setError('Failed to load track data. Please try again later.');
        }
        setLoading(false);
      }
    };

    fetchTrackTree();
  }, [trackId, secret, fetchChildren, trackData]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // Reset the internal navigation flag when user uses browser navigation
      isInternalNavigationRef.current = false;
      // The useEffect will handle fetching the new track based on URL params
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Build tree structure: selected track + ancestors + their immediate children
  const buildTreeStructure = useCallback(() => {
    if (!selectedTrackId || !trackData.has(selectedTrackId)) return { nodes: [], edges: [], clusterNodes: [] };

    const selectedTrack = trackData.get(selectedTrackId);
    const structure = {
      nodes: [],
      edges: [],
      levels: new Map(), // level -> array of trackIds
      clusterNodes: new Map(), // parentTrackId -> childCount (for unloaded children)
    };

    // Build ancestor chain
    const ancestors = [];
    let current = selectedTrack;
    while (current && current.parent_track_id) {
      const parent = trackData.get(current.parent_track_id);
      if (parent) {
        ancestors.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }

    // Calculate selected track's level (0 = root)
    const selectedLevel = ancestors.length;

    // Add all tracks to their respective levels
    // Level 0 = root, Level 1 = first collab, etc.
    ancestors.forEach((ancestor, index) => {
      const level = index;
      if (!structure.levels.has(level)) {
        structure.levels.set(level, []);
      }
      structure.levels.get(level).push(ancestor.id);
    });

    // Add selected track to its level
    if (!structure.levels.has(selectedLevel)) {
      structure.levels.set(selectedLevel, []);
    }
    if (!structure.levels.get(selectedLevel).includes(selectedTrackId)) {
      structure.levels.get(selectedLevel).push(selectedTrackId);
    }

    // Add children for each ancestor and selected track
    const allTracksToShow = [...ancestors, selectedTrack];
    allTracksToShow.forEach(track => {
      const children = childrenData.get(track.id) || [];
      const trackLevel = track === selectedTrack ? selectedLevel : ancestors.indexOf(track);
      const pagination = paginationData.get(track.id);

      if (children.length > 0) {
        // Children are loaded - show them
        const childrenToShow = children.slice(0, MAX_NODES_PER_LEVEL);

        childrenToShow.forEach((child) => {
          const childLevel = trackLevel + 1;
          if (childLevel <= MAX_LEVELS) {
            if (!structure.levels.has(childLevel)) {
              structure.levels.set(childLevel, []);
            }
            if (!structure.levels.get(childLevel).includes(child.id)) {
              structure.levels.get(childLevel).push(child.id);

              // if allTracksToShow doesnt contain the child, add a collab node
              if(!allTracksToShow.some(t => t.id === child.id)) {
                if (child.collab_count && child.collab_count > 0) {
                  console.log('adding collab node', child.id);
                  structure.clusterNodes.set(`collab-${child.id}`, {
                    type: 'collab',
                    count: child.collab_count,
                    parentId: child.id
                  });
                }
              }
            }
          }
        });

        // Handle cluster nodes based on pagination data
        if (pagination) {
          const currentPage = pagination.page;
          const limit = pagination.limit;
          const total = pagination.total;

          // Calculate prev page cluster node count
          const prevPageCount = currentPage > 1 ? (currentPage - 1) * limit : 0;
          if (prevPageCount > 0) {
            structure.clusterNodes.set(`prev-${track.id}`, {
              type: 'prevPage',
              count: prevPageCount,
              parentId: track.id
            });
          }

          // Calculate next page cluster node count (limited to one page worth)
          const nextPageCount = Math.min(total - (currentPage * limit), limit);
          if (nextPageCount > 0) {
            structure.clusterNodes.set(`next-${track.id}`, {
              type: 'nextPage',
              count: nextPageCount,
              parentId: track.id
            });
          }
        } else {
          // Fallback: if there are more children than shown, add to cluster nodes
          const remainingChildren = children.length - MAX_NODES_PER_LEVEL;
          if (remainingChildren > 0) {
            structure.clusterNodes.set(track.id, remainingChildren);
          }
        }
      }
    });

    // Sort tracks at each level by creation date (and ID as fallback) to maintain consistent order
    // This ensures nodes don't change position when selected
    structure.levels.forEach((trackIds, level) => {
      const sorted = [...trackIds].sort((a, b) => {
        const trackA = trackData.get(a);
        const trackB = trackData.get(b);
        if (!trackA || !trackB) return 0;
        
        // Sort by creation date first, then by ID for stability
        const dateA = new Date(trackA.created_at).getTime();
        const dateB = new Date(trackB.created_at).getTime();
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        return a - b; // Fallback to ID comparison
      });
      structure.levels.set(level, sorted);
    });

    return structure;
  }, [selectedTrackId, trackData, childrenData]);

  // Generate React Flow nodes and edges from tree structure using hierarchical renderer
  const generateNodesAndEdges = useCallback(() => {
    const structure = buildTreeStructure();
    generateHierarchicalTreeNodesAndEdges({
      structure,
      trackData,
      selectedTrackId,
      setNodes,
      setEdges,
      handleNodeClick,
      handleClusterNodeClick,
      setHoveredTrackId,
      setHoveredNodePosition,
      hoverTimeoutRef
    });
  }, [buildTreeStructure, trackData, selectedTrackId, setNodes, setEdges, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef]);

  // Update nodes and edges when data changes
  useEffect(() => {
    if (selectedTrackId && trackData.size > 0) {
      generateNodesAndEdges();
    }
  }, [selectedTrackId, trackData, childrenData, paginationData, generateNodesAndEdges]);

  // Handle cluster node click (for pagination)
  const handleClusterNodeClick = useCallback(async (type, parentTrackId) => {
    const pagination = paginationData.get(parentTrackId);
    if (!pagination) return;

    let newPage;
    if (type === 'prevPage' && pagination.page > 1) {
      newPage = pagination.page - 1;
    } else if (type === 'nextPage' && pagination.page < pagination.pages) {
      newPage = pagination.page + 1;
    } else {
      return; // Invalid navigation
    }

    // Fetch children for the new page
    try {
      let data = null;
      if (testMode) {
        const response = await api.get(`/tracks/${parentTrackId}/related-test`, {
          params: {
            page: newPage,
            limit: MAX_NODES_PER_LEVEL,
            includeChildCount: true,
            includeParent: false,
            depth: trackData.get(parentTrackId)?.depth || 0
          }
        });
        data = response.data;
      }

      const { tracks, pagination: newPagination } = data;

      // Update children data with new page data
      const newChildrenData = new Map(childrenData);
      newChildrenData.set(parentTrackId, tracks);

      // Update pagination data
      const newPaginationData = new Map(paginationData);
      newPaginationData.set(parentTrackId, newPagination);

      // Store all tracks in trackData
      const newTrackData = new Map(trackData);
      tracks.forEach(track => {
        newTrackData.set(track.id, track);
      });

      setTrackData(newTrackData);
      setChildrenData(newChildrenData);
      setPaginationData(newPaginationData);

    } catch (err) {
      console.error(`Failed to fetch page ${newPage} children for track ${parentTrackId}:`, err);
    }
  }, [childrenData, paginationData, trackData, testMode, api]);

  // Handle node click
  const handleNodeClick = useCallback(async (clickedTrackId) => {
    // Don't do anything if this track is already selected
    if (clickedTrackId === selectedTrackId) {
      return;
    }

    const clickedTrack = trackData.get(clickedTrackId);
    if (!clickedTrack) {
      // Track not found, can't proceed
      return;
    }

    // Mark this as internal navigation to prevent full reload
    isInternalNavigationRef.current = true;

    // Update URL without causing navigation/reload
    const newUrl = `/tree2/${clickedTrack.guid}${secret ? `?secret=${secret}` : ''}`;
    const fullUrl = `${window.location.origin}${newUrl}`;
    // Use window.history.pushState to update URL without triggering Next.js navigation/remount
    window.history.pushState(null, '', newUrl);

    // Update selected track immediately
    setSelectedTrackId(clickedTrackId);

    // Fetch children if not already loaded
    const hasChildren = childrenData.has(clickedTrackId);
    if (!hasChildren) {
      const children = await fetchChildren(clickedTrackId);
      if (children && children.length > 0) {
        // Store all tracks in trackData
        const newTrackData = new Map(trackData);
        children.forEach(child => {
          newTrackData.set(child.id, child);
        });

        // Store children in childrenData
        const newChildrenData = new Map(childrenData);
        newChildrenData.set(clickedTrackId, children);

        setTrackData(newTrackData);
        setChildrenData(newChildrenData);
      }
    }
  }, [trackData, childrenData, secret, selectedTrackId, router, fetchChildren]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="track-detail-page loading">
        <LoadingSpinner size="medium" />
        <p>Loading track tree...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="track-detail-page error">
        <p>{error}</p>
        <button onClick={() => router.back()} className="back-button">
          Go Back
        </button>
      </div>
    );
  }

  if (isMobile) {
    return null; // Will redirect
  }

  return (
    <div className={styles['track-tree-page']} style={{ width: '100%', height: '100vh' }}>
      <div className={styles['about-header']} style={{ marginBottom: '0px', padding: '20px' }}>
        <h1 className={styles['about-title']}>Track Tree</h1>
        <p className={styles['about-subtitle']}>Explore all the different versions of this track</p>
      </div>
      
      <div style={{ width: '100%', height: 'calc(100vh - 150px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.001}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <ColorLegend />

      {hoveredTrackId && trackData.has(hoveredTrackId) && hoveredNodePosition && (
        <TrackPopover
          track={trackData.get(hoveredTrackId)}
          position={hoveredNodePosition}
          onClose={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
            setHoveredTrackId(null);
            setHoveredNodePosition(null);
          }}
          onMouseEnter={() => {
            // Cancel any pending hide timeout when mouse enters popover
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
          }}
        />
      )}
    </div>
  );
}
