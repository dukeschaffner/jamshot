'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import LoadingSpinner from '../../../components/LoadingSpinner';
import TrackNode from './components/TrackNode';
import ClusterNode from './components/ClusterNode';
import TrackPopover from './components/TrackPopover';
import ColorLegend from './components/ColorLegend';
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
import { useLoopListening } from './utils/LoopListeningContext';
// import { useAudio } from '../../../lib/AudioContext';
import RadialScrollSeam from './components/RadialScrollSeam';
import LoadNewTracksButton from './components/LoadNewTracksButton';
import { TreeInteractionsProvider } from './utils/TreeInteractionsContext';
import { bufferRegistry } from '../../../components/DAW/core/BufferRegistry.js';

// Toggle for new tracks polling - set to false to disable
const ENABLE_NEW_TRACKS_POLLING = true;

// Node types
const nodeTypes = {
  trackNode: TrackNode,
  clusterNode: ClusterNode,
  concentricNode: ConcentricNode,
};

// Component that uses regular audio (when not in loop mode)
// function TrackTreeContentWithAudio({ treeDataManager, rootTrack, isLoopMode }) {
//   const { currentTrack, isPlaying, playTrack, togglePlayPause, playedTracks } = useAudio();
//   return <TrackTreeContent currentTrack={currentTrack} isPlaying={isPlaying} playTrack={playTrack} togglePlayPause={togglePlayPause} playedTracks={playedTracks} treeDataManager={treeDataManager} rootTrack={rootTrack} isLoopMode={isLoopMode} />;
// }

// Component that uses loop listening (when in loop mode, inside provider)
function TrackTreeContentWithLoopListening({ treeDataManager, rootTrack, isLoopMode }) {
  const { currentTrack, trackPath, isPlaying, playTrack, togglePlayPause, playedTracks } = useLoopListening();
  return <TrackTreeContent currentTrack={currentTrack} trackPath={trackPath} isPlaying={isPlaying} playTrack={playTrack} togglePlayPause={togglePlayPause} playedTracks={playedTracks} treeDataManager={treeDataManager} rootTrack={rootTrack} isLoopMode={isLoopMode} />;
}

// Main content component that receives audio context and other props
function TrackTreeContent({ currentTrack, trackPath, isPlaying, playTrack, togglePlayPause, playedTracks, treeDataManager: treeDataManagerProp, rootTrack: rootTrackProp, isLoopMode: isLoopModeProp }) {
  const { trackId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const { isMobile } = useMobile();
  const { showInfo } = useToast();
  const [treeType, setTreeType] = useState('concentric');
  const treeDataManager = treeDataManagerProp;
  
  
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [hoveredTrackId, setHoveredTrackId] = useState(null);
  const [hoveredNodePosition, setHoveredNodePosition] = useState(null);
  const concentricParentTrackIdRef = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [newTrackCount, setNewTrackCount] = useState(0);
  const hoverTimeoutRef = useRef(null);
  const initialTreeRenderedRef = useRef(false);
  const previousSelectedTrackIdRef = useRef(null);
  const reactFlowContainerRef = useRef(null);
  const rootTrack = rootTrackProp;
  const isLoopMode = isLoopModeProp;
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

  // Calculate if scrolling is possible
  const canScroll = useMemo(() => {
    if (treeType !== 'concentric' || !concentricParentTrackIdRef.current || !treeDataManager.current) {
      return false;
    }

    const apiPagination = treeDataManager.current.paginationData.get(concentricParentTrackIdRef.current);
    if (!apiPagination) {
      return false;
    }

    const allChildren = treeDataManager.current.childrenData.get(concentricParentTrackIdRef.current) || [];
    
    // Scrolling is possible if we have more children than the limit OR there's more data to load
    return allChildren.length > CONCENTRIC_CONFIG.CHILDREN_LIMIT || apiPagination.hasMore;
  }, [treeType, concentricParentTrackIdRef.current, treeDataManager]);



  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);


  // Initialize tree data from props (treeDataManager should already be initialized by outer component)
  useEffect(() => {
    if (treeDataManagerProp && treeDataManagerProp.current && treeDataManagerProp.current.trackData) {
      viewState.current.expandedTrackIds = new Set(treeDataManagerProp.current.childrenData.keys());
      viewState.current.paginationByParent = new Map(
        Array.from(treeDataManagerProp.current.paginationData, ([id, pagination]) => [
          id, 
          { page: 1, pageSize: CONCENTRIC_CONFIG.CHILDREN_LIMIT }
        ])
      );
      // Set selectedTrackId to the current track (trackId from params)
      setSelectedTrackId(trackId);
      setInitialLoadComplete(true);
    }
  }, [treeDataManagerProp, trackId]);



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
          handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef,
          currentTrack,
          playedTracks: playedTracks
        });
        newNodes = nodes;
        concentricParentTrackIdRef.current = parentTrackId;
      }
    treeDataManager.current.recordUsage({nodes: newNodes, rendered: true});
    initialTreeRenderedRef.current = true;
    previousSelectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId, treeType,setNodes, setEdges, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef, currentTrack, playedTracks]);


  // Update nodes and edges when data changes
  useEffect(() => {
    if (initialLoadComplete && selectedTrackId && !initialTreeRenderedRef.current) {
      generateNodesAndEdges();
    }
  }, [initialLoadComplete, selectedTrackId, generateNodesAndEdges]);

  // Update node data when currentTrack or playedTracks changes (for pulsing gradient effect and faded style)
  useEffect(() => {
    if (treeType === 'concentric' && nodes.length > 0) {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === 'concentricNode' && node.data) {
            return {
              ...node,
              data: {
                ...node.data,
                currentTrack: currentTrack,
                playedTracks: playedTracks,
              },
            };
          }
          return node;
        })
      );
    }
  }, [currentTrack, playedTracks, treeType, setNodes]);

  const getRotationOffsetForTrack = (trackId) => {
    const track = treeDataManager.current.trackData.get(trackId);
    if(!track || !track.parent_track_id) return 0;
    const children = treeDataManager.current.childrenData.get(track.parent_track_id);
    if(!children || children.length <= CONCENTRIC_CONFIG.CHILDREN_LIMIT) return 0;
    const trackIndex = children.findIndex(child => child.id === trackId);
    if(trackIndex === -1) return 0;
    const sliceAngle = 2 * Math.PI / CONCENTRIC_CONFIG.CHILDREN_LIMIT;
    return Math.max(0, (trackIndex - 6) * sliceAngle);
  };


  const navigateToPlayingTrack = useCallback(() => {
    viewState.current.expandedTrackIds = new Set(trackPath.slice(0, trackPath.length - 1));
    viewState.current.renderer.rotationOffset = getRotationOffsetForTrack(currentTrack.id);

    generateNodesAndEdges();
        
    // render the subtree (should replace load-children node with children nodes)
    // const { nodes, edges, parentTrackId } = generateConcentricTree({
    //   treeDataManager: treeDataManager.current,
    //   viewState: viewState.current,
    //   selectedTrackId,
    //   handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef,
    //   currentTrack,
    //   playedTracks: playedTracks
    // });
    // setNodes(nodes);
    // setEdges(edges);
    // // animateNodeExpand(nodesRef.current, nodes, parentTrackId, setNodes, edges, setEdges);
    // treeDataManager.current.recordUsage({nodes, rendered: true});
    // concentricParentTrackIdRef.current = parentTrackId;
  }, [currentTrack, trackPath, playedTracks]);



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
        viewState.current.renderer.rotationOffset = 0;
        handleConcentricNodeClick(clickedTrackId, treeDataManager.current, viewState.current);
        
        const { nodes, edges, parentTrackId } = generateConcentricTree({
          treeDataManager: treeDataManager.current,
          viewState: viewState.current,
          selectedTrackId,
          handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef,
          currentTrack,
          playedTracks: playedTracks
        });
        animateNodeCollapse(nodesRef.current, nodes, clickedTrackId, setNodes, edges, setEdges);
        concentricParentTrackIdRef.current = parentTrackId;
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
        viewState.current.renderer.rotationOffset = 0;
        
        // render the subtree (should replace load-children node with children nodes)
        const { nodes, edges, parentTrackId } = generateConcentricTree({
          treeDataManager: treeDataManager.current,
          viewState: viewState.current,
          selectedTrackId,
          handleNodeClick, handleClusterNodeClick, handleLoadChildrenClick, setHoveredTrackId, setHoveredNodePosition, hoverTimeoutRef,
          currentTrack,
          playedTracks: playedTracks
        });
        animateNodeExpand(nodesRef.current, nodes, clickedTrackId, setNodes, edges, setEdges);
        treeDataManager.current.recordUsage({nodes, rendered: true});
        concentricParentTrackIdRef.current = parentTrackId;
      }
    }
    
  }

  // Handle loading new tracks (older children)
  const handleLoadNewTracks = useCallback(async () => {
    if (!concentricParentTrackIdRef.current || !treeDataManager.current) {
      return;
    }

    const parentTrackId = concentricParentTrackIdRef.current;
    
    // Fetch and set new children
    await treeDataManager.current.fetchAndSetNewChildren(parentTrackId);
    
    // Reset rotation offset to 0
    viewState.current.renderer.rotationOffset = 0;
    
    // Re-render the tree
    generateNodesAndEdges();
    checkAndSetHasNewTracks();
  }, [concentricParentTrackIdRef.current, generateNodesAndEdges]);

  // Handle radial scroll rotation
  const handleRadialScroll = useCallback(async (event) => {
    if (treeType !== 'concentric' || !concentricParentTrackIdRef.current || !treeDataManager.current) {
      return;
    }

    // Prevent default scroll behavior
    // event.preventDefault();
    event.stopPropagation();

    if (isScrollingRef.current) return;
    isScrollingRef.current = true;

    const parentTrackId = concentricParentTrackIdRef.current;

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

    if(pageEndIndex >= allChildren.length && apiPagination.hasMore) {
      await treeDataManager.current.fetchAndSetChildren(parentTrackId, allChildren[allChildren.length - 1].id);
    }
    else if(!apiPagination.hasMore && pageEndIndex >= allChildren.length) {
      const sliceAngle = 2 * Math.PI / CONCENTRIC_CONFIG.CHILDREN_LIMIT;
      const maxAngle = sliceAngle * (allChildren.length - CONCENTRIC_CONFIG.CHILDREN_LIMIT + 4);
      if(newAngle > maxAngle) {
        viewState.current.renderer.rotationOffset = maxAngle;
        isScrollingRef.current = false;
        return;
      }
    }
    

    generateNodesAndEdges();


    // Reset scrolling flag after a short delay
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 50);
  }, [treeType, concentricParentTrackIdRef.current, generateNodesAndEdges, setNodes]);



  useEffect(() => {
    if (!selectedTrackId || !previousSelectedTrackIdRef.current || !treeDataManager.current) return;

    if (selectedTrackId === previousSelectedTrackIdRef.current) {
      return;
    }

    const selectedTrack = treeDataManager.current.trackData.get(selectedTrackId);
    if (!selectedTrack) {
      throw new Error('Selected track not found');
    }

    // Update URL without causing navigation/reload
    const newUrl = `/tree2/${selectedTrack.guid}${secret ? `?secret=${secret}` : ''}`;
    // Use window.history.pushState to update URL without triggering Next.js navigation/remount
    window.history.pushState(null, '', newUrl);

    previousSelectedTrackIdRef.current = selectedTrackId;

  }, [selectedTrackId]);






  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Handle spacebar for play/pause
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only handle spacebar
      if (event.code !== 'Space' && event.key !== ' ') {
        return;
      }

      // Don't trigger if user is typing in an input field
      const target = event.target;
      const isInputElement = 
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInputElement) {
        return;
      }

      // Prevent default behavior (scrolling)
      event.preventDefault();

      // Toggle play/pause
      togglePlayPause();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [togglePlayPause]);

  useEffect(() => {
    checkAndSetHasNewTracks();
  }, [concentricParentTrackIdRef.current]);

  const checkAndSetHasNewTracks = () => {
    if (treeDataManager.current && concentricParentTrackIdRef.current) {
      const count = treeDataManager.current.getNewKidsCount(concentricParentTrackIdRef.current);
      setNewTrackCount(count);
    }
    else {
      setNewTrackCount(0);
    }
  };

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
        let url = `/tracks/${treeDataManager.current.rootTrackId}/tree/new-tracks?since=${encodeURIComponent(sinceTimestamp)}`;
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
          // Add 1ms buffer to avoid fetching the same track again due to timestamp precision issues
          const mostRecentTime = new Date(mostRecentTrack.created_at);
          lastPollTimeRef.current = new Date(mostRecentTime.getTime() + 1);

          // Mark parent trackIds as having new kids available
          // Count new tracks per parent
          const newTracksByParent = new Map();
          tracks.forEach(track => {
            if (track.parent_track_id && !treeDataManager.current.trackData.has(track.id)) {
              const currentCount = newTracksByParent.get(track.parent_track_id) || 0;
              newTracksByParent.set(track.parent_track_id, currentCount + 1);
            }
          });
          
          // Update counts for each parent
          newTracksByParent.forEach((count, parentId) => {
            treeDataManager.current.markNewKidsAvailable(parentId, count);
            
            // Update collab_count on the parent track in trackData
            const parentTrack = treeDataManager.current.trackData.get(parentId);
            if (parentTrack) {
              const currentCollabCount = parentTrack.collab_count || 0;
              parentTrack.collab_count = currentCollabCount + count;
              // Update the trackData map with the modified track
              treeDataManager.current.trackData.set(parentId, parentTrack);
            }
            
            if(parentId === concentricParentTrackIdRef.current) {
              const totalCount = treeDataManager.current.getNewKidsCount(parentId);
              setNewTrackCount(totalCount);
            }
          });
          
          // Rerender nodes to reflect updated collab_count
          if (initialLoadComplete && selectedTrackId) {
            generateNodesAndEdges();
          }

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
  }, [initialLoadComplete, trackId, secret, showInfo, selectedTrackId, generateNodesAndEdges]);

  // Loading and error are handled by outer component
  if (isMobile) {
    return null; // Will redirect
  }

  return (
    <TreeInteractionsProvider navigateToPlayingTrack={navigateToPlayingTrack}>
      <div className={styles['track-tree-page']} style={{ width: '100%', height: '100%' }}>
        
        <div 
          ref={reactFlowContainerRef} 
          style={{ width: '100%', height: '100%', position: 'relative' }}
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
            nodesDraggable={false}
          >
            <Background />
            <Controls showInteractive={false}/>
            {canScroll && <RadialScrollSeam />}
            <LoadNewTracksButton 
              newTrackCount={newTrackCount}
              onLoadNewTracks={handleLoadNewTracks}
            />
          </ReactFlow>
          {DEBUG_MODE && (
            <DebugOverlay reactFlowInstance={reactFlowInstance} containerRef={reactFlowContainerRef} />
          )}
        </div>

      {/* <ColorLegend /> */}

      {hoveredTrackId && treeDataManager.current && treeDataManager.current.trackData.has(hoveredTrackId) && hoveredNodePosition && (
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
    </TreeInteractionsProvider>
  );
}

// Outer component that handles setup
export default function TrackTreePage() {
  const { trackId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const { isMobile } = useMobile();
  
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState(null);
  const [rootTrack, setRootTrack] = useState(null);
  const [isLoopMode, setIsLoopMode] = useState(false);
  const treeDataManager = useRef(null);

  // Check if mobile - redirect to old tree view
  useEffect(() => {
    if (!isMobile && isMobile !== undefined) {
      const loadTree = async () => {
        setLoading(true);
        try {
          treeDataManager.current = new TreeDataManager(secret);
          if(DEBUG_MODE) {
            window.treeDataManager = treeDataManager.current;
          }
          await treeDataManager.current.fetchTrackTree(trackId);
          
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

    // Cleanup on unmount
    return () => {
      // Clear the buffer registry
      bufferRegistry.buffers.clear();
      bufferRegistry.metadata.clear();
    };
  }, [isMobile, trackId, secret, router]);

  // Only render content once tree is loaded
  if (!initialLoadComplete || !treeDataManager.current) {
    if (loading) {
      return (
        <div className="track-detail-page loading">
          <LoadingSpinner size="medium" />
          <p>Loading track tree...</p>
        </div>
      );
    }
    return null;
  }

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

  // Wrap with LoopListeningProvider if in loop mode
  if (isLoopMode && rootTrack) {
    return (
      <LoopListeningProvider rootTrack={rootTrack} treeDataManager={treeDataManager.current}>
        <LoopListeningSetup />
        <TrackTreeContentWithLoopListening treeDataManager={treeDataManager} rootTrack={rootTrack} isLoopMode={isLoopMode} />
      </LoopListeningProvider>
    );
  }

  // return <TrackTreeContentWithAudio treeDataManager={treeDataManager} rootTrack={rootTrack} isLoopMode={isLoopMode} />;
}
