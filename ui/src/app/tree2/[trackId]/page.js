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
import { TreeDataManager } from './treeDataManager.js';


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
  const [treeType, setTreeType] = useState('radial');
  const treeDataManager = useRef(null);
  
  
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [hoveredTrackId, setHoveredTrackId] = useState(null);
  const [hoveredNodePosition, setHoveredNodePosition] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const lastLoadedTrackGuidRef = useRef(null);
  const initialTreeRenderedRef = useRef(false);
  const previousSelectedTrackIdRef = useRef(null);

  const nodesRef = useRef([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);


  // Check if mobile - redirect to old tree view
  useEffect(() => {
    if (!isMobile && isMobile !== undefined) {
      const loadTree = async () => {
        setLoading(true);
        try {
          treeDataManager.current = new TreeDataManager(secret);
          await treeDataManager.current.fetchTrackTree(trackId);
          console.log(treeDataManager.current.trackData);
          // Set selectedTrackId to the current track (trackId from params)
          setSelectedTrackId(trackId);
          setInitialLoadComplete(true);
        } catch (err) {
          console.error('Failed to load track tree:', err);
          setError(err.message || 'Failed to load track tree');
        } finally {
          setLoading(false);
        }
      };
      loadTree();
    } else if (isMobile) {
      // Redirect to old tree view on mobile
      router.replace(`/tree/${trackId}${secret ? `?secret=${secret}` : ''}`);
    }
  }, [isMobile, trackId, secret, router]);



  // Generate React Flow nodes and edges from tree structure using hierarchical renderer
  const generateNodesAndEdges = useCallback(() => {
    if (!selectedTrackId ) return;

    generateRadialTreeNodesAndEdges({
      treeDataManager: treeDataManager.current,
      selectedTrackId,
      setNodes,
      setEdges,
      handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef
    });
    initialTreeRenderedRef.current = true;
    previousSelectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId, setNodes, setEdges, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef]);


  // Update nodes and edges when data changes
  useEffect(() => {
    if (initialLoadComplete && selectedTrackId) {
      generateNodesAndEdges();
    }
  }, [initialLoadComplete, selectedTrackId, generateNodesAndEdges]);



  const deleteNode = (nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
    );
  };


  // Handle node click
  const handleNodeClick = useCallback((clickedTrackId) => {
    // setSelectedTrackId(clickedTrackId);
  }, []);

  // Handle cluster node click (stub for now)
  const handleClusterNodeClick = useCallback(async (type, parentTrackId) => {
    // TODO: Implement cluster node click handling
    console.log('Cluster node click:', type, parentTrackId);
  }, []);

  // Handle node click
  const handleLoadChildrenClick = async (clickedTrackId) => {
    // Fetch children if not already loaded
    const hasChildren = treeDataManager.current.childrenData.has(clickedTrackId);
    if (!hasChildren) {
      await treeDataManager.current.fetchAndSetChildren(clickedTrackId);
    }

    const node = nodesRef.current.find(node => node.id === 'track-' + clickedTrackId);
    if (node) {
      const handlers = {
        handleNodeClick,
        handleClusterNodeClick,
        handleLoadChildrenClick,
        setHoveredTrackId,
        setHoveredNodePosition,
        hoverTimeoutRef,
      }
      generateRadialSubtreeNodesAndEdges({node, treeDataManager: treeDataManager.current, selectedTrackId, setNodes, setEdges, handlers});
    }
    deleteNode("load-children-" + clickedTrackId);

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

  }, [selectedTrackId]);



  // // Handle cluster node click (for pagination)
  // const handleClusterNodeClick = useCallback(async (type, parentTrackId) => {
  //   const pagination = paginationData.get(parentTrackId);
  //   if (!pagination) return;

  //   let newPage;
  //   if (type === 'prevPage' && pagination.page > 1) {
  //     newPage = pagination.page - 1;
  //   } else if (type === 'nextPage' && pagination.page < pagination.pages) {
  //     newPage = pagination.page + 1;
  //   } else {
  //     return; // Invalid navigation
  //   }

  //   // Fetch children for the new page
  //   try {
  //     let data = null;
  //     if (testMode) {
  //       const response = await api.get(`/tracks/${parentTrackId}/related-test`, {
  //         params: {
  //           page: newPage,
  //           limit: MAX_NODES_PER_LEVEL,
  //           includeChildCount: true,
  //           includeParent: false,
  //           depth: trackData.get(parentTrackId)?.depth || 0
  //         }
  //       });
  //       data = response.data;
  //     }
  //     else {
  //       const response = await api.get(`/tracks/${parentTrackId}/related`, {
  //         params: {
  //           page: newPage,
  //           limit: MAX_NODES_PER_LEVEL,
  //           includeChildCount: true,
  //           includeParent: false
  //         }
  //       });
  //       data = response.data;
  //     }

  //     const { tracks, pagination: newPagination } = data;

  //     // Update children data with new page data
  //     const newChildrenData = new Map(childrenData);
  //     newChildrenData.set(parentTrackId, tracks);

  //     // Update pagination data
  //     const newPaginationData = new Map(paginationData);
  //     newPaginationData.set(parentTrackId, newPagination);

  //     // Store all tracks in trackData
  //     const newTrackData = new Map(trackData);
  //     tracks.forEach(track => {
  //       newTrackData.set(track.id, track);
  //     });

  //     setTrackData(newTrackData);
  //     setChildrenData(newChildrenData);
  //     setPaginationData(newPaginationData);

  //   } catch (err) {
  //     console.error(`Failed to fetch page ${newPage} children for track ${parentTrackId}:`, err);
  //   }
  // }, [childrenData, paginationData, trackData, testMode, api]);






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

      {hoveredTrackId && treeDataManager.current.trackData.has(hoveredTrackId) && hoveredNodePosition && (
        <TrackPopover
          track={treeDataManager.current.trackData.get(hoveredTrackId)}
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
