'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import LoadingSpinner from '../../../components/LoadingSpinner';
import TrackNode from './components/TrackNode';
import ClusterNode from './components/ClusterNode';
import TrackPopover from './components/TrackPopover';
import ColorLegend from './components/ColorLegend';
import { useAudio } from '../../../lib/AudioContext';
import { useMobile } from '../../../contexts/MobileContext';
import { LoopListeningProvider } from './utils/LoopListeningContext';
import LoopListeningPlayer from './components/LoopListeningPlayer';
import LoopListeningSetup from './components/LoopListeningSetup';
import { generateRadialTree, generateRadialSubtree, animateNode, moveNodeToSubtreeStart} from './utils/radialTreeRenderer';
import styles from './TreeView.module.css';
import { TreeDataManager } from './utils/treeDataManager.js';
import ConcentricNode from './components/ConcentricNode';
import { generateConcentricTree, handleConcentricNodeClick, animateNodeExpand, animateNodeCollapse, getPageStartIndex} from './utils/concentricRenderer';
import DebugOverlay from './components/DebugOverlay';
import { DEBUG_MODE, CONCENTRIC_CONFIG, MAX_NODES_PER_LEVEL, BASE_NODE_SIZE, BASE_CLUSTER_NODE_SIZE } from './utils/config';
import { polarRadiansToCartesian } from './utils/renderUtils';
import api from '../../../lib/api';
import { useToast } from '../../../lib/ToastContext';

// Toggle for new tracks polling - set to false to disable
const ENABLE_NEW_TRACKS_POLLING = true;

// Node types
const nodeTypes = {
  trackNode: TrackNode,
  clusterNode: ClusterNode,
  concentricNode: ConcentricNode,
};

export default function TrackTreePage() {
  const { trackId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const { isMobile } = useMobile();
  const { currentTrack, playTrack, togglePlayPause, isPlaying } = useAudio();
  const { showInfo } = useToast();
  const [treeType, setTreeType] = useState('concentric');
  const treeDataManager = useRef(null);
  
  
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [hoveredTrackId, setHoveredTrackId] = useState(null);
  const [hoveredNodePosition, setHoveredNodePosition] = useState(null);
  const [concentricParentTrackId, setConcentricParentTrackId] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const initialTreeRenderedRef = useRef(false);
  const previousSelectedTrackIdRef = useRef(null);
  const reactFlowContainerRef = useRef(null);
  const [rootTrack, setRootTrack] = useState(null);
  const [isLoopMode, setIsLoopMode] = useState(false);
  const lastPollTimeRef = useRef(null);

  const nodesRef = useRef([]);
  const isScrollingRef = useRef(false);

  const viewState = useRef({
    selectedTrackId: null,
    expandedTrackIds: new Set(),
    paginationByParent: new Map(),
    renderer: {
      rotationOffset: 0, // Track rotation offset in radians
    },
  });



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
          viewState.current.expandedTrackIds = new Set(treeDataManager.current.childrenData.keys());
          viewState.current.paginationByParent = new Map(
            Array.from(treeDataManager.current.paginationData, ([id, pagination]) => [
              id, 
              { page: 1, pageSize: CONCENTRIC_CONFIG.CHILDREN_LIMIT }
            ])
          );
          // Set selectedTrackId to the current track (trackId from params)
          setSelectedTrackId(trackId);
          
          // Get root track and check if it's a loop track
          const rootTrackId = treeDataManager.current.rootTrackId;
          if (rootTrackId && treeDataManager.current.trackData.has(rootTrackId)) {
            const root = treeDataManager.current.trackData.get(rootTrackId);
            setRootTrack(root);
            setIsLoopMode(root.is_loop || false);
          }
          
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

    let newNodes = [];

    if(treeType === 'radial') {
      const { nodes } = generateRadialTree({
        treeDataManager: treeDataManager.current,
        viewState: viewState.current,
        selectedTrackId,
        setNodes,
        setEdges,
        handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef
      });
      newNodes = nodes;
    }
    else if(treeType === 'concentric') {
      const { nodes, parentTrackId } = generateConcentricTree({
        treeDataManager: treeDataManager.current,
        viewState: viewState.current,
        selectedTrackId,
        setNodes,
        setEdges,
        handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef
      });
      newNodes = nodes;
      setConcentricParentTrackId(parentTrackId);
    }
    treeDataManager.current.recordUsage({nodes: newNodes, rendered: true});
    initialTreeRenderedRef.current = true;
    previousSelectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId, treeType,setNodes, setEdges, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef]);


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

  /**
   * Deletes all nodes and edges associated with the given trackIds
   * Handles regular nodes, cluster nodes, and load-children nodes
   * Only calls setNodes and setEdges once at the end
   * @param {string[]} trackIds - Array of track IDs to delete
   */
  const deleteNodes = (trackIds) => {
    if (!trackIds || trackIds.length === 0 || trackIds.size === 0) return;

    // Build a set of trackIds for quick lookup
    const trackIdSet = new Set(trackIds);

    // Helper function to check if a node should be deleted
    const shouldDeleteNode = (node) => {
      // Check if node ID starts with track-{trackId}
      if (node.id.startsWith('track-')) {
        const nodeTrackId = parseInt(node.id.replace('track-', ''));
        return trackIdSet.has(nodeTrackId);
      }
      
      // Check if node ID starts with load-children-{trackId}
      if (node.id.startsWith('load-children-')) {
        const nodeTrackId = parseInt(node.id.replace('load-children-', ''));
        return trackIdSet.has(nodeTrackId);
      }
      
      return false;
    };

    const nodeIdsToDelete = nodesRef.current.filter((n) => shouldDeleteNode(n)).map((n) => n.id);

    setNodes((nds) => nds.filter((n) => !nodeIdsToDelete.includes(n.id)));
    setEdges((eds) => eds.filter((e) => !nodeIdsToDelete.includes(e.source) && !nodeIdsToDelete.includes(e.target)));
  };


  // Handle node click
  const handleNodeClick = (clickedTrackId) => {
    // setSelectedTrackId(clickedTrackId);
    if(treeType === 'radial') {
      moveNodeToSubtreeStart(nodesRef.current.find(n => n.id === 'track-' + clickedTrackId), nodesRef.current, treeDataManager.current, viewState.current, setNodes);
    }
    else if(treeType === 'concentric') {
      if(viewState.current.expandedTrackIds.has(clickedTrackId)) {
        handleConcentricNodeClick(clickedTrackId, treeDataManager.current, viewState.current);
        const { nodes, edges, parentTrackId } = generateConcentricTree({
          treeDataManager: treeDataManager.current,
          viewState: viewState.current,
          selectedTrackId,
          handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef
        });
        animateNodeCollapse(nodesRef.current, nodes, clickedTrackId, setNodes, edges, setEdges);
        setConcentricParentTrackId(parentTrackId);
      }
    }
  };

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
      viewState.current.expandedTrackIds.add(clickedTrackId);
      viewState.current.paginationByParent.set(clickedTrackId, {
        page: 1,
        pageSize: CONCENTRIC_CONFIG.CHILDREN_LIMIT
      });

      const handlers = {
        handleNodeClick,
        handleClusterNodeClick,
        handleLoadChildrenClick,
        setHoveredTrackId,
        setHoveredNodePosition,
        hoverTimeoutRef,
      }

      if(treeType === 'radial') {
        // render the subtree (should replace load-children node with children nodes)
        const { nodes } = generateRadialSubtree({node, treeDataManager: treeDataManager.current, viewState: viewState.current, selectedTrackId, setNodes, setEdges, handlers});
        treeDataManager.current.recordUsage({nodes, rendered: true});

        // delete the load-children node
        deleteNode("load-children-" + clickedTrackId);

        // prune the tree
        const idsToPrune = treeDataManager.current.pruneTree();
        if(idsToPrune.size > 0) {
          console.log('idsToPrune', idsToPrune);
          deleteNodes(idsToPrune);
          treeDataManager.current.recordUsage({trackIds: idsToPrune, rendered: false, setTimestamp: false });

          // Ensure parents whose children have been pruned show the load-children node instead of the subtree
          const parentsToRerender = new Set();
          idsToPrune.forEach(id => {
            const parentId = treeDataManager.current.trackData.get(id).parent_track_id;
            if(parentId) {
              parentsToRerender.add(parentId);
            }
          });
          parentsToRerender.forEach(id => {
            // remove parent from expandedTrackIds
            viewState.current.expandedTrackIds.delete(id);
            const node = nodesRef.current.find(n => n.id === 'track-' + id);
            generateRadialSubtree({node, treeDataManager: treeDataManager.current, viewState: viewState.current, selectedTrackId, setNodes, setEdges, handlers});
            // This should just replace children with load-children nodes - no need to record usage
          });
        }
      }
      else if(treeType === 'concentric') {
        // render the subtree (should replace load-children node with children nodes)
        const { nodes, edges, parentTrackId } = generateConcentricTree({
          treeDataManager: treeDataManager.current,
          viewState: viewState.current,
          selectedTrackId,
          handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef
        });
        animateNodeExpand(nodesRef.current, nodes, clickedTrackId, setNodes, edges, setEdges);
        treeDataManager.current.recordUsage({nodes, rendered: true});
        setConcentricParentTrackId(parentTrackId);
      }
    }
    
  }

  // Handle radial scroll rotation
  const handleRadialScroll = useCallback(async (event) => {
    if (treeType !== 'concentric' || !concentricParentTrackId || !treeDataManager.current) {
      return;
    }

    // Prevent default scroll behavior
    event.preventDefault();
    event.stopPropagation();

    if (isScrollingRef.current) return;
    isScrollingRef.current = true;

    const parentTrackId = concentricParentTrackId;

    const apiPagination = treeDataManager.current.paginationData.get(parentTrackId);
    if (!apiPagination) {
      isScrollingRef.current = false;
      return;
    }

    const allChildren = treeDataManager.current.childrenData.get(parentTrackId) || [];

    // If we have less than pageSize children and no more children to load, stop scrolling
    if (allChildren.length <= CONCENTRIC_CONFIG.CHILDREN_LIMIT && !apiPagination.hasMore) {
      isScrollingRef.current = false;
      return;
    }

    // Calculate scroll delta (negative = scroll down/clockwise, positive = scroll up/counter-clockwise)
    const delta = event.deltaY;
    const scrollSensitivity = 0.005; // Adjust this to control scroll speed
    const angleDelta = delta * scrollSensitivity;

    // Calculate slice angle for displayed children
    const prevAngle = viewState.current.renderer.rotationOffset;
    const newAngle = viewState.current.renderer.rotationOffset + angleDelta;

    // Update rotation offset
    viewState.current.renderer.rotationOffset = newAngle > 0 ? newAngle : 0;

    const pageStartIndex = getPageStartIndex(parentTrackId, viewState.current);
    const pageEndIndex = pageStartIndex + CONCENTRIC_CONFIG.CHILDREN_LIMIT - 1;
    console.log(`page: ${pageStartIndex} - ${pageEndIndex}`);

    if(pageEndIndex >= allChildren.length && apiPagination.hasMore) {
      await treeDataManager.current.fetchAndSetChildren(parentTrackId, allChildren[allChildren.length - 1].id);
    }
    else if(!apiPagination.hasMore && pageEndIndex >= allChildren.length) {
      viewState.current.renderer.rotationOffset = prevAngle;
      isScrollingRef.current = false;
      return;
    }
    

    generateNodesAndEdges();







    
    // // Normalize rotation offset to [0, sliceAngle) range
    // while (viewState.current.renderer.rotationOffset >= sliceAngle) {
    //   viewState.current.renderer.rotationOffset -= sliceAngle;
      
    //   // Scrolling forward (clockwise) - need more nodes at the end
    //   const nextEndIndex = currentEndIndex + 1;
    //   const hasAllNeeded = allChildren.length >= nextEndIndex;
      
    //   if (!hasAllNeeded && apiPagination.hasMore) {
    //     // Load more children
    //     const lastId = treeDataManager.current.getLastTrackId(parentTrackId);
    //     await treeDataManager.current.fetchAndSetChildren(parentTrackId, lastId);
    //     // Update allChildren after loading
    //     const updatedChildren = treeDataManager.current.childrenData.get(parentTrackId) || [];
    //     if (updatedChildren.length > allChildren.length) {
    //       // Continue with updated data
    //     }
    //   }

    //   // Update pagination to show new range (move forward by 1)
    //   const newStartIndex = Math.min(currentStartIndex + 1, (treeDataManager.current.childrenData.get(parentTrackId) || []).length - pageSize);
    //   const newPage = Math.floor(newStartIndex / pageSize) + 1;
      
    //   // Update UI pagination state
    //   viewState.current.paginationByParent.set(parentTrackId, {
    //     page: newPage,
    //     pageSize: pageSize
    //   });

    //   // Regenerate tree with new pagination
    //   generateNodesAndEdges();
    //   isScrollingRef.current = false;
    //   return;
    // }
    
    // while (viewState.current.renderer.rotationOffset < 0) {
    //   viewState.current.renderer.rotationOffset += sliceAngle;
      
    //   // Scrolling backward (counter-clockwise) - need more nodes at the start
    //   if (currentStartIndex > 0) {
    //     // Update pagination to show new range (move backward by 1)
    //     const newStartIndex = Math.max(0, currentStartIndex - 1);
    //     const newPage = Math.floor(newStartIndex / pageSize) + 1;
        
    //     // Update UI pagination state
    //     viewState.current.paginationByParent.set(parentTrackId, {
    //       page: newPage,
    //       pageSize: pageSize
    //     });

    //     // Regenerate tree with new pagination
    //     generateNodesAndEdges();
    //     isScrollingRef.current = false;
    //     return;
    //   } else {
    //     // Can't go back further, reset rotation offset
    //     viewState.current.renderer.rotationOffset = 0;
    //   }
    // }

    // // Just update angles without changing pagination - apply rotation to visible nodes
    // setNodes((currentNodes) =>
    //   currentNodes.map((node) => {
    //     if (node.data?.type === 'outer' && node.data.angle !== undefined) {
    //       const newAngle = ((node.data.angle + angleDelta) % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI);
    //       const { x, y } = polarRadiansToCartesian(0, 0, CONCENTRIC_CONFIG.OUTER_RING_RADIUS, newAngle);
    //       return {
    //         ...node,
    //         position: { x: x - BASE_NODE_SIZE / 2, y: y - BASE_NODE_SIZE / 2 },
    //         data: {
    //           ...node.data,
    //           angle: newAngle,
    //         },
    //       };
    //     }
    //     // Also update load-children nodes
    //     if (node.id.startsWith('load-children-') && node.data?.angle !== undefined) {
    //       const newAngle = ((node.data.angle + angleDelta) % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI);
    //       const ringNumber = node.data.ringNumber || 1;
    //       const radius = CONCENTRIC_CONFIG.OUTER_RING_RADIUS * (ringNumber + 0.3);
    //       const { x, y } = polarRadiansToCartesian(0, 0, radius, newAngle);
    //       return {
    //         ...node,
    //         position: { x: x - BASE_CLUSTER_NODE_SIZE / 2, y: y - BASE_CLUSTER_NODE_SIZE / 2 },
    //         data: {
    //           ...node.data,
    //           angle: newAngle,
    //         },
    //       };
    //     }
    //     return node;
    //   })
    // );

    // Reset scrolling flag after a short delay
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 50);
  }, [treeType, concentricParentTrackId, generateNodesAndEdges, setNodes]);



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

  // Poll for new tracks every 60 seconds
  useEffect(() => {
    if (!ENABLE_NEW_TRACKS_POLLING || !initialLoadComplete || !trackId) {
      return;
    }

    // Initialize last poll time to now when polling starts
    lastPollTimeRef.current = new Date();
    let pollInterval;

    const pollForNewTracks = async () => {
      try {
        // toISOString() returns UTC timestamp in ISO 8601 format (e.g., "2024-01-01T12:00:00.000Z")
        // This matches the UTC timestamps stored in the database
        const sinceTimestamp = lastPollTimeRef.current.toISOString();
        let url = `/tracks/${trackId}/tree/new-tracks?since=${encodeURIComponent(sinceTimestamp)}`;
        if (secret) {
          url += `&secret=${encodeURIComponent(secret)}`;
        }

        const response = await api.get(url);
        const { tracks } = response.data;

        if (tracks && tracks.length > 0) {
          // Update last poll time to the most recent track's created_at
          // Database returns created_at in UTC, so we parse it and convert back to UTC ISO string
          const mostRecentTrack = tracks.reduce((latest, track) => {
            const trackTime = new Date(track.created_at);
            const latestTime = new Date(latest.created_at);
            return trackTime > latestTime ? track : latest;
          });
          // Ensure we store UTC timestamp - created_at from DB is already UTC
          lastPollTimeRef.current = new Date(mostRecentTrack.created_at);

          // Show toast notification
          if (tracks.length === 1) {
            const track = tracks[0];
            showInfo(
              'New Track Added',
              `${track.username} added "${track.title}"`,
              { duration: 6000 }
            );
          } else {
            showInfo(
              'New Tracks Added',
              `${tracks.length} new tracks added to this tree`,
              { duration: 6000 }
            );
          }
        }
      } catch (err) {
        // Silently fail - don't show errors for polling
        console.error('Error polling for new tracks:', err);
      }
    };

    // Start polling after initial load (wait 60 seconds before first poll)
    const initialDelay = setTimeout(() => {
      pollForNewTracks();
      // Then poll every 60 seconds
      pollInterval = setInterval(pollForNewTracks, 60000);
    }, 60000);

    return () => {
      clearTimeout(initialDelay);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [initialLoadComplete, trackId, secret, showInfo]);

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

  const pageContent = (
    <div className={styles['track-tree-page']} style={{ width: '100%', height: '100vh' }}>
      <div className={styles['about-header']} style={{ marginBottom: '0px', padding: '20px' }}>
        <h1 className={styles['about-title']}>Track Tree</h1>
        <p className={styles['about-subtitle']}>Explore all the different versions of this track</p>
      </div>
      
      <div 
        ref={reactFlowContainerRef} 
        style={{ width: '100%', height: 'calc(100vh - 150px)', position: 'relative' }}
        onWheel={handleRadialScroll}
      >
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
          zoomOnScroll={false}     // 🔥 disable built-in wheel zoom
          panOnScroll={false}
        >
          <Background />
          <Controls />
        </ReactFlow>
        {DEBUG_MODE && (
          <DebugOverlay reactFlowInstance={reactFlowInstance} containerRef={reactFlowContainerRef} />
        )}
      </div>

      <ColorLegend />

      {hoveredTrackId && treeDataManager.current.trackData.has(hoveredTrackId) && hoveredNodePosition && (
        <TrackPopover
          track={treeDataManager.current.trackData.get(hoveredTrackId)}
          position={hoveredNodePosition}
          isLoopMode={isLoopMode}
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
      
      {isLoopMode && (
        <LoopListeningPlayer />
      )}
    </div>
  );

  // Wrap with LoopListeningProvider if in loop mode
  if (isLoopMode && rootTrack) {
    return (
      <LoopListeningProvider rootTrack={rootTrack} treeDataManager={treeDataManager.current}>
        <LoopListeningSetup />
        {pageContent}
      </LoopListeningProvider>
    );
  }

  return pageContent;
}
