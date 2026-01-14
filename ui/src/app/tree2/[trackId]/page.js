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
import TrackPopover from './components/TrackPopover';
import ColorLegend from './components/ColorLegend';
import { useAudio } from '../../../lib/AudioContext';
import { useMobile } from '../../../contexts/MobileContext';
import styles from './TreeView.module.css';

// Configuration constants
const MAX_NODES_PER_LEVEL = 20;
const MAX_VISIBLE_NODES = 50;
const MAX_LEVELS = 5;

// Node types
const nodeTypes = {
  trackNode: TrackNode,
};

export default function TrackTreePage() {
  const { trackId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const { isMobile } = useMobile();
  const { currentTrack, playTrack, togglePlayPause, isPlaying } = useAudio();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [hoveredTrackId, setHoveredTrackId] = useState(null);
  const [hoveredNodePosition, setHoveredNodePosition] = useState(null);
  const [trackData, setTrackData] = useState(new Map()); // trackId -> track data
  const [childrenData, setChildrenData] = useState(new Map()); // trackId -> children array
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const isInternalNavigationRef = useRef(false);
  const lastLoadedTrackGuidRef = useRef(null);

  // Fetch children for a track
  const fetchChildren = useCallback(async (parentTrackId) => {
    try {
      const response = await api.get(`/tracks/${parentTrackId}/related`, {
        params: { page: 1, limit: MAX_NODES_PER_LEVEL }
      });
      
      const { tracks } = response.data;
      const children = tracks?.filter(t => t.parent_track_id === parentTrackId) || [];
      
      // Update childrenData
      setChildrenData(prev => {
        const newMap = new Map(prev);
        newMap.set(parentTrackId, children);
        return newMap;
      });

      // Store children tracks in trackData
      setTrackData(prev => {
        const newMap = new Map(prev);
        children.forEach(track => {
          newMap.set(track.id, track);
        });
        return newMap;
      });
    } catch (err) {
      console.error(`Failed to fetch children for track ${parentTrackId}:`, err);
    }
  }, []);

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
        setTrackData(newTrackData);

        // Set selected track to the current track (last in array)
        const currentTrack = trackTree[trackTree.length - 1];
        setSelectedTrackId(currentTrack.id);
        lastLoadedTrackGuidRef.current = trackId;

        // Fetch children for all tracks in the tree
        await Promise.all(
          trackTree.map(track => {
            if (!childrenData.has(track.id)) {
              return fetchChildren(track.id);
            }
            return Promise.resolve();
          })
        );

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
  }, [trackId, secret, fetchChildren]);

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
    if (!selectedTrackId || !trackData.has(selectedTrackId)) return { nodes: [], edges: [] };

    const selectedTrack = trackData.get(selectedTrackId);
    const structure = {
      nodes: [],
      edges: [],
      levels: new Map(), // level -> array of trackIds
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
      
      // Limit children shown
      const childrenToShow = children.slice(0, MAX_NODES_PER_LEVEL);
      
      childrenToShow.forEach((child) => {
        const childLevel = trackLevel + 1;
        if (childLevel <= MAX_LEVELS) {
          if (!structure.levels.has(childLevel)) {
            structure.levels.set(childLevel, []);
          }
          if (!structure.levels.get(childLevel).includes(child.id)) {
            structure.levels.get(childLevel).push(child.id);
          }
        }
      });
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

  // Generate React Flow nodes and edges from tree structure
  const generateNodesAndEdges = useCallback(() => {
    const structure = buildTreeStructure();
    if (structure.nodes.length === 0 && structure.levels.size === 0) return;

    const flowNodes = [];
    const flowEdges = [];
    const levelPositions = new Map(); // level -> array of x positions

    // Calculate positions for each level
    const levels = Array.from(structure.levels.keys()).sort((a, b) => a - b);
    const levelHeight = 200; // Vertical spacing between levels
    const startY = 100;

    levels.forEach(level => {
      const trackIds = structure.levels.get(level);
      const nodeWidth = 120; // Approximate node width
      const spacing = 150; // Horizontal spacing between nodes
      const totalWidth = trackIds.length * spacing;
      const startX = -totalWidth / 2 + spacing / 2;

      levelPositions.set(level, trackIds.map((_, index) => startX + index * spacing));

      trackIds.forEach((trackId, index) => {
        const track = trackData.get(trackId);
        if (!track) return;

        const x = levelPositions.get(level)[index];
        const y = startY + level * levelHeight;

        flowNodes.push({
          id: `track-${trackId}`,
          type: 'trackNode',
          position: { x, y },
          data: {
            track,
            isSelected: trackId === selectedTrackId,
            onNodeClick: () => handleNodeClick(trackId),
            onNodeHover: (hovering, nodePosition) => {
              // Clear any existing timeout
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
              
              if (hovering && nodePosition) {
                // Set node's screen position for popover
                setHoveredNodePosition(nodePosition);
                // Show popover immediately on hover
                setHoveredTrackId(trackId);
              } else {
                // Delay hiding the popover to allow mouse to move to it
                hoverTimeoutRef.current = setTimeout(() => {
                  setHoveredTrackId(null);
                  setHoveredNodePosition(null);
                  hoverTimeoutRef.current = null;
                }, 200); // 200ms delay
              }
            },
          },
        });

        // Add edge from parent
        if (track.parent_track_id) {
          const parentTrackId = track.parent_track_id;
          const parentTrack = trackData.get(parentTrackId);
          if (parentTrack) {
            // Find parent's level
            let parentLevel = -1;
            for (const [level, trackIds] of structure.levels.entries()) {
              if (trackIds.includes(parentTrackId)) {
                parentLevel = level;
                break;
              }
            }

            if (parentLevel >= 0) {
              const parentIndex = structure.levels.get(parentLevel).indexOf(parentTrackId);
              const parentX = levelPositions.get(parentLevel)[parentIndex];
              const parentY = startY + parentLevel * levelHeight;

              flowEdges.push({
                id: `edge-${parentTrackId}-${trackId}`,
                source: `track-${parentTrackId}`,
                target: `track-${trackId}`,
                type: 'default',
                animated: false,
                style: { stroke: '#86a699', strokeWidth: 2 },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: '#86a699',
                },
              });
            }
          }
        }
      });
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [buildTreeStructure, trackData, selectedTrackId, setNodes, setEdges]);

  // Update nodes and edges when data changes
  useEffect(() => {
    if (selectedTrackId && trackData.size > 0) {
      generateNodesAndEdges();
    }
  }, [selectedTrackId, trackData, childrenData, generateNodesAndEdges]);

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
      await fetchChildren(clickedTrackId);
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
