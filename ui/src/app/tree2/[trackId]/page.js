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
import { generateRadialTreeNodesAndEdges, generateRadialSubtreeNodesAndEdges } from './radialTreeRenderer';
import styles from './TreeView.module.css';

// Configuration constants
const MAX_NODES_PER_LEVEL = 10;
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
  const [rootTrackId, setRootTrackId] = useState(null);
  const [hoveredTrackId, setHoveredTrackId] = useState(null);
  const [hoveredNodePosition, setHoveredNodePosition] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const lastLoadedTrackGuidRef = useRef(null);
  const initialTreeRenderedRef = useRef(false);
  const previousSelectedTrackIdRef = useRef(null);

  const testMode = true;


  // Check if mobile - redirect to old tree view
  useEffect(() => {
    if (!isMobile && isMobile !== undefined) {
      // Desktop only - continue
    } else if (isMobile) {
      // Redirect to old tree view on mobile
      router.replace(`/tree/${trackId}${secret ? `?secret=${secret}` : ''}`);
    }
  }, [isMobile, trackId, secret, router]);







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


    const { tracks, pagination } = data;

    // Store pagination data
    setPaginationData(prev => new Map(prev).set(parentTrackId, pagination));

    return tracks;
  } catch (err) {
    console.error(`Failed to fetch children for track ${parentTrackId}:`, err);
  }
}, [trackData]);


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

        // Set root track id
        setRootTrackId(trackTree[0].id);

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

        // Ensure parent->child relationships from trackTree are included in childrenData
        for (let i = 1; i < trackTree.length; i++) {
          const childTrack = trackTree[i];
          const parentTrack = trackTree[i - 1];
          const parentId = parentTrack.id;
          
          // Get existing children for this parent, or create new array
          const existingChildren = newChildrenData.get(parentId) || [];
          
          // Check if this child is already in the children array
          const childExists = existingChildren.some(child => child.id === childTrack.id);
          
          if (!childExists) {
            // Add this child to the parent's children array
            newChildrenData.set(parentId, [...existingChildren, childTrack]);
          }
        }

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


  // Generate React Flow nodes and edges from tree structure using hierarchical renderer
  const generateNodesAndEdges = useCallback(() => {
    if (!rootTrackId || !trackData || !childrenData || !selectedTrackId ) return;

    generateRadialTreeNodesAndEdges({
      rootTrackId,
      trackData,
      childrenData,
      selectedTrackId,
      setNodes,
      setEdges,
      handleNodeClick, handleClusterNodeClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef
    });
    initialTreeRenderedRef.current = true;
    previousSelectedTrackIdRef.current = selectedTrackId;
  }, [rootTrackId, trackData, childrenData, selectedTrackId, setNodes, setEdges, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef]);


  const generateSubtreeNodesAndEdges = useCallback((node) => {
    if (!selectedTrackId || !trackData || !childrenData || !previousSelectedTrackIdRef.current) return;
    const handlers = {
      handleNodeClick,
      handleClusterNodeClick,
      setHoveredTrackId,
      setHoveredNodePosition,
      hoverTimeoutRef,
    }
    generateRadialSubtreeNodesAndEdges({node, trackData, childrenData, selectedTrackId, setNodes, setEdges, handlers});
  }, [selectedTrackId, trackData, childrenData, setNodes, setEdges, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef]);

  // Update nodes and edges when data changes
  useEffect(() => {
    if (selectedTrackId && trackData.size > 0 && !initialTreeRenderedRef.current) {
      generateNodesAndEdges();
    }
  }, [selectedTrackId, trackData, childrenData, paginationData, generateNodesAndEdges]);




  // Handle node click
  const handleNodeClick = (clickedTrackId) => {
    setSelectedTrackId(clickedTrackId);
  }

  useEffect(() => {
    if (!selectedTrackId || !previousSelectedTrackIdRef.current) return;

    if (selectedTrackId === previousSelectedTrackIdRef.current) {
      return;
    }

    const selectedTrack = trackData.get(selectedTrackId);
    if (!selectedTrack) {
      throw new Error('Selected track not found');
    }

    // Update URL without causing navigation/reload
    const newUrl = `/tree2/${selectedTrack.guid}${secret ? `?secret=${secret}` : ''}`;
    // Use window.history.pushState to update URL without triggering Next.js navigation/remount
    window.history.pushState(null, '', newUrl);

    previousSelectedTrackIdRef.current = selectedTrackId;

    const loadChildren = async () => {
      const newTrackData = new Map(trackData);
      const newChildrenData = new Map(childrenData);
      // Fetch children if not already loaded
      const hasChildren = childrenData.has(selectedTrackId);
      if (!hasChildren) {
        const children = await fetchChildren(selectedTrackId);
        if (children && children.length > 0) {
          // Store all tracks in trackData
          
          children.forEach(child => {
            newTrackData.set(child.id, child);
          });

          // Store children in childrenData
          newChildrenData.set(selectedTrackId, children);

          setTrackData(newTrackData);
          setChildrenData(newChildrenData);
        }
      }

      const node = nodes.find(node => node.id === 'track-' + selectedTrackId);
      if (node) {
        const handlers = {
          handleNodeClick,
          handleClusterNodeClick,
          setHoveredTrackId,
          setHoveredNodePosition,
          hoverTimeoutRef,
        }
        generateRadialSubtreeNodesAndEdges({node, trackData: newTrackData, childrenData: newChildrenData, selectedTrackId, setNodes, setEdges, handlers});
      }
    };

    loadChildren();
  }, [selectedTrackId]);



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
      else {
        const response = await api.get(`/tracks/${parentTrackId}/related`, {
          params: {
            page: newPage,
            limit: MAX_NODES_PER_LEVEL,
            includeChildCount: true,
            includeParent: false
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
          maxZoom={10}
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
