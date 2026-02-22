import { BASE_NODE_SIZE, BASE_CLUSTER_NODE_SIZE, CONCENTRIC_CONFIG } from './config';
import { polarRadiansToCartesian } from './renderUtils';

const { OUTER_RING_RADIUS, CHILDREN_LIMIT, BASE_RING_SIZE, RING_SPACING } = CONCENTRIC_CONFIG;
// const { CHILDREN_LIMIT, RING_SPACING } = CONCENTRIC_CONFIG;

/**
 * Calculate opacity based on angle for fading near top of circle
 * @param {number} angle - Angle in radians [0, 2π)
 * @returns {number} Opacity value [0, 1]
 */
function calculateOpacityFromAngle(angle) {
  if (angle === undefined) return 1;
  
  // Top of circle is at 3π/2 (or -π/2) in standard polar coordinates
  const topAngle = 3 * Math.PI / 2;
  // Calculate distance from top, handling wrap-around
  let angleFromTop = Math.abs(angle - topAngle);
  // Handle wrap-around (if angle is near 0 or 2π, check distance via the other direction)
  if (angleFromTop > Math.PI) {
    angleFromTop = 2 * Math.PI - angleFromTop;
  }
  
  // Start fading at ±20 degrees from top, fully transparent at ±5 degrees
  const fadeStart = 20 * (Math.PI / 180); // 0.3491 radians
  const fadeEnd = 5 * (Math.PI / 180); // 0.0873 radians
  if (angleFromTop <= fadeStart) {
    if (angleFromTop <= fadeEnd) {
      // Fully transparent at ±5° and closer
      return 0;
    } else {
      // Linear fade from full opacity at ±20° to transparent at ±5°
      return (angleFromTop - fadeEnd) / (fadeStart - fadeEnd);
    }
  }
  return 1;
}

export function getPageStartIndex(parentTrackId, viewState) {
  const angle = viewState.renderer?.rotationOffset || 0;

  // slice = 2pi / children limit
  // 0 -> index 0
  // slice -> index 1
  // 2*slice -> index 2
  // ...
  // 2*Math.PI -> index children limit
  // 2*Math.PI + slice -> index 1
  // 2*Math.PI + 2*slice -> index 2
  // ...
  // 2*Math.PI + 2*Math.PI -> index children limit
  return Math.floor(angle * CHILDREN_LIMIT/ (2 * Math.PI));
}



// #region nodes

function createNode(trackId, type, x, y, trackData, selectedTrackId, ringNumber, angle, sliceAngle, handlers, currentTrack, canScroll = false) {
  let size;
  if(type === 'inner') {
    size = BASE_RING_SIZE + ringNumber * RING_SPACING;
  }
  else if (type === 'outer') {
    size = BASE_NODE_SIZE;
  }
  x = x - size / 2;
  y = y - size / 2;
  const node = {
    id: `track-${trackId}`,
    type: 'concentricNode',
    position: { x, y },
    data: {
      track: trackData.get(trackId),
      isSelected: trackId === selectedTrackId,
      ringNumber: ringNumber,
      angle: angle,
      sliceAngle: sliceAngle,
      type: type,
      currentTrack: currentTrack,
      canScroll: canScroll,
    },
    zIndex: 1000 - ringNumber,
    borderRadius: '50%',

  };
  if(handlers) {
    node.data.onNodeClick = () => handlers.handleNodeClick(trackId);
    node.data.onNodeHover = (hovering, nodePosition) => {
      // Clear any existing timeout
      if (handlers.hoverTimeoutRef.current) {
        clearTimeout(handlers.hoverTimeoutRef.current);
        handlers.hoverTimeoutRef.current = null;
      }

      if (hovering && nodePosition) {
        // Set node's screen position for popover
        handlers.setHoveredNodePosition(nodePosition);
        // Show popover immediately on hover
        handlers.setHoveredTrackId(trackId);
      } else {
        // Delay hiding the popover to allow mouse to move to it
        handlers.hoverTimeoutRef.current = setTimeout(() => {
          handlers.setHoveredTrackId(null);
          handlers.setHoveredNodePosition(null);
          handlers.hoverTimeoutRef.current = null;
        }, 200); // 200ms delay
      }
    };
  }
  return node;
}


function createLoadChildrenNode(trackId, trackData, ringNumber, angle, handlers, canScroll = false) {
  const track = trackData.get(trackId);
  if(!track) throw new Error('Track not found: ' + trackId);


  if(track.collab_count && track.collab_count > 0) {
    const x = polarRadiansToCartesian(0, 0, OUTER_RING_RADIUS * (ringNumber + 0.3), angle).x - BASE_CLUSTER_NODE_SIZE / 2;
    const y = polarRadiansToCartesian(0, 0, OUTER_RING_RADIUS * (ringNumber + 0.3), angle).y - BASE_CLUSTER_NODE_SIZE / 2;
    const node = {
      id: `load-children-${trackId}`,
      type: 'clusterNode',
      position: { x, y },
      data: {
        childCount: track.collab_count,
        clusterType: 'loadChildren',
        type: 'concentric',
        ringNumber: ringNumber,
        angle: angle, // Store angle so it can be rotated with scroll
        canScroll: canScroll, // Store whether scrolling is possible
      },
    };
    if(handlers) {
      node.data.onNodeClick = () => handlers.handleLoadChildrenClick(trackId);
    }
    return node;
  }
}

function createPaginationNode(trackId, clusterType, ringNumber, angle, handlers) {
  const x = polarRadiansToCartesian(0, 0, RING_SPACING * (ringNumber + 0.15), angle).x;
  const y = polarRadiansToCartesian(0, 0, RING_SPACING * (ringNumber + 0.15), angle).y;
  const node = {
    id: `${clusterType}-${trackId}`,
    type: 'clusterNode',
    position: { x, y },
    data: {
      childCount: 0,
      clusterType: clusterType,
      type: 'radial',
      ringNumber: ringNumber,
    },
  };
  // Click handlers will be added later
  return node;
}

// #endregion





// #region tree building



/**
 * Generates React Flow nodes and edges from tree structure using a hierarchical layout
 * @param {Object} params - Parameters for rendering
 * @param {string} params.rootTrackId - Root track ID
 * @param {Map} params.trackData - Map of trackId -> track data
 * @param {Map} params.childrenData - Map of trackId -> children array
 * @param {string} params.selectedTrackId - Currently selected track ID
 * @param {Function} params.setNodes - React Flow setNodes function
 * @param {Function} params.setEdges - React Flow setEdges function
 * @param {Function} params.handleNodeClick - Function to handle node clicks
 * @param {Function} params.handleClusterNodeClick - Function to handle cluster node clicks
 * @param {Function} params.setHoveredTrackId - Function to set hovered track ID
 * @param {Function} params.setHoveredNodePosition - Function to set hovered node position
 * @param {Object} params.hoverTimeoutRef - Reference to hover timeout
 */
export function generateConcentricTree({
  treeDataManager,
  selectedTrackId,
  viewState,
  setNodes,
  setEdges,
  handleNodeClick,
  handleClusterNodeClick,
  handleLoadChildrenClick,
  setHoveredTrackId,
  setHoveredNodePosition,
  hoverTimeoutRef,
  currentTrack,
  canScroll = false
}) {

  const rootTrackId = treeDataManager.rootTrackId;
  const trackData = treeDataManager.trackData;
  const childrenData = treeDataManager.childrenData;

  const flowNodes = [];
  const flowEdges = [];

  const handlers = {
    handleNodeClick: handleNodeClick,
    handleClusterNodeClick: handleClusterNodeClick,
    handleLoadChildrenClick: handleLoadChildrenClick,
    setHoveredTrackId: setHoveredTrackId,
    setHoveredNodePosition: setHoveredNodePosition,
    hoverTimeoutRef: hoverTimeoutRef,
  }


  let done = false;
  let ringNumber = 0;
  let currentTrackId = rootTrackId;
  let previousTrackId = null;

  while(!done) {
    flowNodes.push(createNode(currentTrackId, 'inner', 0, 0, trackData, selectedTrackId, ringNumber, 0, 0, handlers, currentTrack));
    previousTrackId = currentTrackId;
    ringNumber++;

    // Add children nodes
    const children = childrenData.get(currentTrackId);
    if (!children || children.length === 0) {
      done = true;
      break;
    }
    // Note: We no longer check CHILDREN_LIMIT here since we support pagination
    // The UI pagination will limit how many children are displayed at once

    const expandedChild = children.find(child => viewState.expandedTrackIds.has(child.id));
    if(!expandedChild) {
      done = true;
      break;
    }
    currentTrackId = expandedChild.id;
  }



  const allChildren = childrenData.get(previousTrackId) || [];
  

  
  // Filter children based on UI pagination
  const startIndex = getPageStartIndex(previousTrackId, viewState);
  const endIndex = startIndex + CONCENTRIC_CONFIG.CHILDREN_LIMIT - 1;
  const children = allChildren.slice(startIndex, endIndex);
  
  // Validate that we're not trying to display more than CHILDREN_LIMIT at once
  if (children.length > CHILDREN_LIMIT) {
    throw new Error(`Too many children to display: ${children.length} (limit: ${CHILDREN_LIMIT})`);
  }

  // Get rotation offset from viewState
  const rotationOffset = viewState.renderer?.rotationOffset || 0;
  const sliceAngle = 2 * Math.PI / CHILDREN_LIMIT;

  // first current angle should always be - slice angle to 0
  let currentAngle = - (rotationOffset % sliceAngle) - Math.PI / 3; // Start with rotation offset
  const numChildren = allChildren.length > CHILDREN_LIMIT - 1 ? CHILDREN_LIMIT - 1 : allChildren.length;
  const radialSpacing = numChildren > 0 ? 2 * Math.PI / numChildren : 0;
  let idx = 1;

  if(children && children.length > 0) {
    children.forEach(child => {
      // Normalize angle to [0, 2π /)
      const normalizedAngle = ((currentAngle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
      if(idx === 1) {
        console.log(`normalizedAngle: ${normalizedAngle}`);
        idx = 0;
      }
      const x = polarRadiansToCartesian(0, 0, OUTER_RING_RADIUS, normalizedAngle).x;
      const y = polarRadiansToCartesian(0, 0, OUTER_RING_RADIUS, normalizedAngle).y;
      flowNodes.push(createNode(child.id, 'outer', x, y, trackData, selectedTrackId, 1, normalizedAngle, radialSpacing, handlers, currentTrack, canScroll));
    
      // Calculate opacity for edges based on target node's angle
      // Only apply fading if scrolling is possible
      const edgeOpacity = canScroll ? calculateOpacityFromAngle(normalizedAngle) : 1;
      
      // Add edge from root to child
      flowEdges.push({
        id: `edge-${rootTrackId}-${child.id}`,
        source: `track-${rootTrackId}`,
        target: `track-${child.id}`,
        type: 'straight',
        animated: false,
        style: { stroke: '#86a699', strokeWidth: 2, opacity: edgeOpacity },
      });

      // Create load-children node with the same normalized angle
      const loadChildrenNode = createLoadChildrenNode(child.id, treeDataManager.trackData, 1, normalizedAngle, handlers, canScroll);
      if(loadChildrenNode){
        flowNodes.push(loadChildrenNode);
        flowEdges.push({
          id: `edge-load-children-${child.id}`,
          source: `track-${child.id}`,
          target: `load-children-${child.id}`,
          type: 'straight',
          animated: false,
          style: { stroke: '#86a699', strokeWidth: 2, opacity: edgeOpacity },
        });
      }

      currentAngle += radialSpacing;
    });
  }

  if(setNodes) {
    setNodes(flowNodes);
  }
  if(setEdges) {
    setEdges(flowEdges);
  }

  return {nodes: flowNodes, edges: flowEdges, parentTrackId: previousTrackId};
}


export function handleConcentricNodeClick(trackId, treeDataManager, viewState) {
  // Collect the clicked track ID and all its ancestors
  const expandedIds = new Set();
  let currentTrackId = trackId;
  
  // Traverse up the parent chain
  while (currentTrackId) {
    expandedIds.add(currentTrackId);
    const track = treeDataManager.trackData.get(currentTrackId);
    if (!track || !track.parent_track_id) {
      break; // Reached root or track not found
    }
    currentTrackId = track.parent_track_id;
  }
  
  // Set expandedTrackIds to only contain the clicked track and its ancestors
  viewState.expandedTrackIds = expandedIds;
}

// #endregion






// #region animation functions



// export function animateNode(node, setNodes, onComplete) {
//   if (!setNodes) {
//     console.warn('setNodes function is required for animation');
//     if (onComplete) onComplete();
//     return;
//   }

//   const startTime = performance.now();
//   const duration = 500;
//   const startX = node.position.x;
//   const startY = node.position.y;
//   const targetX = startX + 700;
//   const targetY = startY;

//   function step(now) {
//     const elapsed = now - startTime;
//     const t = Math.min(elapsed / duration, 1);

//     // easeInOut cubic easing
//     const easeT = t < 0.5
//       ? 4 * t * t * t
//       : 1 - Math.pow(-2 * t + 2, 3) / 2;

//     const currentX = startX + (targetX - startX) * easeT;
//     const currentY = startY + (targetY - startY) * easeT;

//     // Update node position using setNodes
//     setNodes((nodes) =>
//       nodes.map((n) =>
//         n.id === node.id
//           ? { ...n, position: { x: currentX, y: currentY } }
//           : n
//       )
//     );

//     if (t < 1) {
//       requestAnimationFrame(step);
//     } else {
//       if (onComplete) onComplete();
//     }
//   }

//   requestAnimationFrame(step);
// }


export function animateNodeExpand(oldNodes, newNodes, expandedTrackId, setNodes, newEdges, setEdges, onComplete) {
  if (!setNodes) {
    console.warn('setNodes function is required for animation');
    if (onComplete) onComplete();
    return;
  }

  // Create maps for quick lookup
  const oldNodesMap = new Map(oldNodes.map(node => [node.id, node]));
  const newNodesMap = new Map(newNodes.map(node => [node.id, node]));
  const newNodesIdSet = new Set(newNodes.map(node => node.id));

  // Find the expanded node
  const expandedNodeId = `track-${expandedTrackId}`;
  const expandedOldNode = oldNodesMap.get(expandedNodeId);
  const expandedNewNode = newNodesMap.get(expandedNodeId);

  if (!expandedOldNode || !expandedNewNode) {
    console.warn('Expanded node not found in oldNodes or newNodes');
    if (onComplete) onComplete();
    return;
  }

  // Calculate size for nodes
  const getNodeSize = (node) => {
    if (!node || !node.data) return BASE_NODE_SIZE;
    if (node.data.type === 'inner') {
      return BASE_RING_SIZE + (node.data.ringNumber || 0) * RING_SPACING;
    }
    return BASE_NODE_SIZE;
  };

  // Identify old children (outer nodes that aren't the expanded one, plus their loadChildren)
  const oldChildrenNodes = [];
  const oldLoadChildrenNodes = [];
  
  // First, find the loadChildren node for the expanded node (before expansion)
  const expandedLoadChildrenId = `load-children-${expandedTrackId}`;
  const expandedLoadChildrenNode = oldNodesMap.get(expandedLoadChildrenId);
  if (expandedLoadChildrenNode) {
    oldLoadChildrenNodes.push(expandedLoadChildrenNode);
  }
  
  oldNodes.forEach(node => {
    // Skip inner nodes and the expanded node
    if (node.data?.type === 'inner' || node.id === expandedNodeId) return;
    
    // Track nodes that are outer nodes (siblings of expanded node)
    if (node.id.startsWith('track-') && node.data?.type === 'outer') {
      oldChildrenNodes.push(node);
      // Find associated loadChildren node
      const loadChildrenId = `load-children-${node.id.replace('track-', '')}`;
      const loadChildrenNode = oldNodesMap.get(loadChildrenId);
      if (loadChildrenNode) {
        oldLoadChildrenNodes.push(loadChildrenNode);
      }
    }
  });

  // Identify new children (nodes in newNodes that weren't in oldNodes)
  const newChildrenNodes = newNodes.filter(node => 
    !oldNodesMap.has(node.id) && 
    node.id.startsWith('track-') && 
    node.data?.type === 'outer'
  );

  // Identify new loadChildren nodes (associated with new children)
  const newLoadChildrenNodes = [];
  newChildrenNodes.forEach(childNode => {
    const trackId = childNode.id.replace('track-', '');
    const loadChildrenId = `load-children-${trackId}`;
    const loadChildrenNode = newNodesMap.get(loadChildrenId);
    if (loadChildrenNode && !oldNodesMap.has(loadChildrenId)) {
      newLoadChildrenNodes.push(loadChildrenNode);
    }
  });

  // Calculate animation data for expanded node
  const expandedStartSize = getNodeSize(expandedOldNode);
  const expandedTargetSize = getNodeSize(expandedNewNode);
  const expandedStartX = expandedOldNode.position.x;
  const expandedStartY = expandedOldNode.position.y;
  const expandedTargetX = expandedNewNode.position.x;
  const expandedTargetY = expandedNewNode.position.y;

  // Calculate animation data for old children (move to 0,0)
  const oldChildrenAnimations = oldChildrenNodes.map(node => ({
    id: node.id,
    startX: node.position.x,
    startY: node.position.y,
    targetX: 0,
    targetY: 0,
  }));

  const oldLoadChildrenAnimations = oldLoadChildrenNodes.map(node => ({
    id: node.id,
    startX: node.position.x,
    startY: node.position.y,
    targetX: 0,
    targetY: 0,
  }));

  // Calculate animation data for new children (start from 0,0, move to final positions)
  const newChildrenAnimations = newChildrenNodes.map(node => ({
    id: node.id,
    startX: 0,
    startY: 0,
    targetX: node.position.x,
    targetY: node.position.y,
    startSize: 0,
    targetSize: getNodeSize(node),
  }));

  // Calculate animation data for new loadChildren nodes (start from 0,0, move to final positions)
  const newLoadChildrenAnimations = newLoadChildrenNodes.map(node => ({
    id: node.id,
    startX: 0,
    startY: 0,
    targetX: node.position.x,
    targetY: node.position.y,
  }));

  // Phase 1: Expanded node grows and moves to center, old children move to (0,0)
  const phase1Duration = 500;
  const phase1bDuration = 200; // Fade out duration
  const phase2Duration = 500;

  function runPhase1() {
    const startTime = performance.now();
    const allPhase1Nodes = [expandedNodeId, ...oldChildrenNodes.map(n => n.id), ...oldLoadChildrenNodes.map(n => n.id)];

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / phase1Duration, 1);

      // easeInOut cubic easing
      const easeT = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      setNodes((nodes) =>
        nodes.map((n) => {
          // Animate expanded node (position and size)
          if (n.id === expandedNodeId) {
            const currentX = expandedStartX + (expandedTargetX - expandedStartX) * easeT;
            const currentY = expandedStartY + (expandedTargetY - expandedStartY) * easeT;
            const currentSize = expandedStartSize + (expandedTargetSize - expandedStartSize) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              data: {
                ...n.data,
                size: currentSize,
              },
            };
          }

          // Animate old children to (0,0)
          const childAnim = oldChildrenAnimations.find(a => a.id === n.id);
          if (childAnim) {
            const currentX = childAnim.startX + (childAnim.targetX - childAnim.startX) * easeT;
            const currentY = childAnim.startY + (childAnim.targetY - childAnim.startY) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
            };
          }

          // Animate old loadChildren to (0,0)
          const loadAnim = oldLoadChildrenAnimations.find(a => a.id === n.id);
          if (loadAnim) {
            const currentX = loadAnim.startX + (loadAnim.targetX - loadAnim.startX) * easeT;
            const currentY = loadAnim.startY + (loadAnim.targetY - loadAnim.startY) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
            };
          }

          return n;
        })
      );

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        runPhase1b();
      }
    }

    requestAnimationFrame(step);
  }

  // Phase 1b: Old children disappear (fade out)
  function runPhase1b() {
    const startTime = performance.now();
    const nodesToRemove = [...oldChildrenNodes.map(n => n.id), ...oldLoadChildrenNodes.map(n => n.id)];

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / phase1bDuration, 1);

      setNodes((nodes) =>
        nodes.map((n) => {
          if (nodesToRemove.includes(n.id)) {
            return {
              ...n,
              style: {
                ...n.style,
                opacity: 1 - t,
              },
            };
          }
          return n;
        })
      );

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Remove old children nodes
        setNodes((nodes) => nodes.filter(n => !nodesToRemove.includes(n.id)));
        runPhase2();
      }
    }

    requestAnimationFrame(step);
  }

  // Phase 2: New children appear from (0,0) and move to final positions
  function runPhase2() {
    // Add new children nodes and loadChildren nodes at (0,0) with scale 0
    setNodes((nodes) => {
      const existingNodeIds = new Set(nodes.map(n => n.id));
      const newChildrenToAdd = newChildrenNodes
        .filter(node => !existingNodeIds.has(node.id))
        .map(node => ({
          ...node,
          position: { x: 0, y: 0 },
          data: {
            ...node.data,
            size: 0,
          },
          style: {
            ...node.style,
            opacity: 0,
          },
        }));
      const newLoadChildrenToAdd = newLoadChildrenNodes
        .filter(node => !existingNodeIds.has(node.id))
        .map(node => ({
          ...node,
          position: { x: 0, y: 0 },
          style: {
            ...node.style,
            opacity: 0,
          },
        }));
      return [...nodes, ...newChildrenToAdd, ...newLoadChildrenToAdd];
    });

    // Update edges when new children nodes appear
    if (setEdges && newEdges) {
      setEdges(newEdges);
    }

    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / phase2Duration, 1);

      // easeInOut cubic easing
      const easeT = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      setNodes((nodes) =>
        nodes.map((n) => {
          // Animate new children nodes
          const anim = newChildrenAnimations.find(a => a.id === n.id);
          if (anim) {
            const currentX = anim.startX + (anim.targetX - anim.startX) * easeT;
            const currentY = anim.startY + (anim.targetY - anim.startY) * easeT;
            const currentSize = anim.startSize + (anim.targetSize - anim.startSize) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              data: {
                ...n.data,
                size: currentSize,
              },
              style: {
                ...n.style,
                opacity: easeT,
              },
            };
          }
          // Animate new loadChildren nodes
          const loadAnim = newLoadChildrenAnimations.find(a => a.id === n.id);
          if (loadAnim) {
            const currentX = loadAnim.startX + (loadAnim.targetX - loadAnim.startX) * easeT;
            const currentY = loadAnim.startY + (loadAnim.targetY - loadAnim.startY) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              style: {
                ...n.style,
                opacity: easeT,
              },
            };
          }
          return n;
        })
      );

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Finalize: update nodes to match newNodes exactly
        setNodes((nodes) =>
          nodes.map((n) => {
            const newNode = newNodesMap.get(n.id);
            if (newNode) {
              return newNode;
            }
            return n;
          }).filter(n => newNodesIdSet.has(n.id))
        );
        if (onComplete) onComplete();
      }
    }

    requestAnimationFrame(step);
  }

  // Update expanded node's zIndex and type before Phase 1
  setNodes((nodes) =>
    nodes.map((n) => {
      if (n.id === expandedNodeId) {
        return {
          ...n,
          zIndex: expandedNewNode.zIndex,
          data: {
            ...n.data,
            type: expandedNewNode.data?.type,
          },
        };
      }
      if (n.id === expandedLoadChildrenId) {
        return {
          ...n,
          zIndex: 0
        };
      }
      return n;
    })
  );

  // Start Phase 1
  runPhase1();
}


export function animateNodeCollapse(oldNodes, newNodes, collapsedTrackId, setNodes, newEdges, setEdges, onComplete) {
  if (!setNodes) {
    console.warn('setNodes function is required for animation');
    if (onComplete) onComplete();
    return;
  }

  // Create maps for quick lookup
  const oldNodesMap = new Map(oldNodes.map(node => [node.id, node]));
  const newNodesMap = new Map(newNodes.map(node => [node.id, node]));
  const newNodesIdSet = new Set(newNodes.map(node => node.id));

  // Find the collapsed node (the clicked node)
  const collapsedNodeId = `track-${collapsedTrackId}`;
  const collapsedOldNode = oldNodesMap.get(collapsedNodeId);
  const collapsedNewNode = newNodesMap.get(collapsedNodeId);

  if (!collapsedOldNode || !collapsedNewNode) {
    console.warn('Collapsed node not found in oldNodes or newNodes');
    if (onComplete) onComplete();
    return;
  }

  // Calculate size for nodes
  const getNodeSize = (node) => {
    if (!node || !node.data) return BASE_NODE_SIZE;
    if (node.data.type === 'inner') {
      return BASE_RING_SIZE + (node.data.ringNumber || 0) * RING_SPACING;
    }
    return BASE_NODE_SIZE;
  };

  // Phase 1: Identify nodes to collapse (children and loadChildren in the ring that are outside the clicked node)
  // These are outer nodes that will be removed
  const nodesToCollapse = [];
  const loadChildrenToCollapse = [];
  
  oldNodes.forEach(node => {
    // Skip inner nodes and the collapsed node itself
    if (node.data?.type === 'inner' || node.id === collapsedNodeId) return;
    
    // Find outer nodes (children in the ring) that will be removed
    if (node.id.startsWith('track-') && node.data?.type === 'outer') {
      // Check if this node is not in newNodes (meaning it's being removed)
      if (!newNodesMap.has(node.id)) {
        nodesToCollapse.push(node);
        // Find associated loadChildren node
        const trackId = node.id.replace('track-', '');
        const loadChildrenId = `load-children-${trackId}`;
        const loadChildrenNode = oldNodesMap.get(loadChildrenId);
        if (loadChildrenNode) {
          loadChildrenToCollapse.push(loadChildrenNode);
        }
      }
    }
  });

  // Phase 2a: Find the previously expanded child that needs to move from inner to outer
  // This is a node that was inner in oldNodes but is outer in newNodes
  let previouslyExpandedChild = null;
  let previouslyExpandedChildLoadChildren = null;
  
  oldNodes.forEach(node => {
    if (node.id.startsWith('track-') && node.data?.type === 'inner' && node.id !== collapsedNodeId) {
      const newNode = newNodesMap.get(node.id);
      if (newNode && newNode.data?.type === 'outer') {
        previouslyExpandedChild = { oldNode: node, newNode: newNode };
        // Find its loadChildren node in newNodes
        const trackId = node.id.replace('track-', '');
        const loadChildrenId = `load-children-${trackId}`;
        const loadChildrenNode = newNodesMap.get(loadChildrenId);
        if (loadChildrenNode) {
          previouslyExpandedChildLoadChildren = loadChildrenNode;
        }
        return;
      }
    }
  });

  // Identify inner nodes that are being removed (not the collapsed node, not the previously expanded child)
  // These should shrink and disappear during phase 1
  const innerNodesToRemove = [];
  oldNodes.forEach(node => {
    if (node.id.startsWith('track-') && 
        node.data?.type === 'inner' && 
        node.id !== collapsedNodeId &&
        node.id !== (previouslyExpandedChild?.oldNode?.id)) {
      // Check if this node is not in newNodes (meaning it's being removed)
      if (!newNodesMap.has(node.id)) {
        innerNodesToRemove.push(node);
      }
    }
  });

  // Phase 2b: Identify new children (nodes in newNodes that weren't in oldNodes, excluding the previously expanded child)
  const newChildrenNodes = newNodes.filter(node => 
    !oldNodesMap.has(node.id) && 
    node.id.startsWith('track-') && 
    node.data?.type === 'outer' &&
    node.id !== (previouslyExpandedChild?.newNode?.id)
  );

  // Identify new loadChildren nodes (associated with new children, including the one for previously expanded child)
  const newLoadChildrenNodes = [];
  
  // Add loadChildren for previously expanded child if it exists
  if (previouslyExpandedChildLoadChildren) {
    newLoadChildrenNodes.push(previouslyExpandedChildLoadChildren);
  }
  
  // Add loadChildren for other new children
  newChildrenNodes.forEach(childNode => {
    const trackId = childNode.id.replace('track-', '');
    const loadChildrenId = `load-children-${trackId}`;
    const loadChildrenNode = newNodesMap.get(loadChildrenId);
    if (loadChildrenNode && !oldNodesMap.has(loadChildrenId)) {
      newLoadChildrenNodes.push(loadChildrenNode);
    }
  });

  // Calculate animation data for collapsed node (if it changes position/size)
  const collapsedStartSize = getNodeSize(collapsedOldNode);
  const collapsedTargetSize = getNodeSize(collapsedNewNode);
  const collapsedStartX = collapsedOldNode.position.x;
  const collapsedStartY = collapsedOldNode.position.y;
  const collapsedTargetX = collapsedNewNode.position.x;
  const collapsedTargetY = collapsedNewNode.position.y;

  // Calculate animation data for nodes to collapse (move to 0,0)
  const collapseAnimations = nodesToCollapse.map(node => ({
    id: node.id,
    startX: node.position.x,
    startY: node.position.y,
    targetX: 0,
    targetY: 0,
  }));

  const loadChildrenCollapseAnimations = loadChildrenToCollapse.map(node => ({
    id: node.id,
    startX: node.position.x,
    startY: node.position.y,
    targetX: 0,
    targetY: 0,
  }));

  // Calculate animation data for inner nodes to remove (shrink to 0,0 and fade out)
  const innerNodesToRemoveAnimations = innerNodesToRemove.map(node => ({
    id: node.id,
    startX: node.position.x,
    startY: node.position.y,
    targetX: 0,
    targetY: 0,
    startSize: getNodeSize(node),
    targetSize: 0,
  }));

  // Calculate animation data for previously expanded child (2a)
  let previouslyExpandedChildAnimation = null;
  if (previouslyExpandedChild) {
    const oldNode = previouslyExpandedChild.oldNode;
    const newNode = previouslyExpandedChild.newNode;
    previouslyExpandedChildAnimation = {
      id: oldNode.id,
      startX: oldNode.position.x,
      startY: oldNode.position.y,
      targetX: newNode.position.x,
      targetY: newNode.position.y,
      startSize: getNodeSize(oldNode),
      targetSize: getNodeSize(newNode),
    };
  }

  // Calculate animation data for new children (2b) - start from 0,0, move to final positions
  const newChildrenAnimations = newChildrenNodes.map(node => ({
    id: node.id,
    startX: 0,
    startY: 0,
    targetX: node.position.x,
    targetY: node.position.y,
    startSize: 0,
    targetSize: getNodeSize(node),
  }));

  // Calculate animation data for new loadChildren nodes (2b) - start from 0,0, move to final positions
  // Exclude the loadChildren for previously expanded child since it's handled separately
  const newLoadChildrenAnimations = newLoadChildrenNodes
    .filter(node => !previouslyExpandedChildLoadChildren || node.id !== previouslyExpandedChildLoadChildren.id)
    .map(node => ({
      id: node.id,
      startX: 0,
      startY: 0,
      targetX: node.position.x,
      targetY: node.position.y,
    }));

  // Animation durations
  const phase1Duration = 500;
  const phase1bDuration = 200; // Fade out duration
  const phase2Duration = 500;

  // Phase 1: Nodes to collapse move to (0,0), inner nodes shrink and fade out
  function runPhase1() {
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / phase1Duration, 1);

      // easeInOut cubic easing
      const easeT = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      setNodes((nodes) =>
        nodes.map((n) => {
          // Animate collapsed node (if it changes position/size)
          if (n.id === collapsedNodeId && (collapsedStartX !== collapsedTargetX || collapsedStartY !== collapsedTargetY || collapsedStartSize !== collapsedTargetSize)) {
            const currentX = collapsedStartX + (collapsedTargetX - collapsedStartX) * easeT;
            const currentY = collapsedStartY + (collapsedTargetY - collapsedStartY) * easeT;
            const currentSize = collapsedStartSize + (collapsedTargetSize - collapsedStartSize) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              data: {
                ...n.data,
                size: currentSize,
              },
            };
          }

          // Animate inner nodes to remove (shrink to 0,0 and fade out)
          const innerRemoveAnim = innerNodesToRemoveAnimations.find(a => a.id === n.id);
          if (innerRemoveAnim) {
            const currentX = innerRemoveAnim.startX + (innerRemoveAnim.targetX - innerRemoveAnim.startX) * easeT;
            const currentY = innerRemoveAnim.startY + (innerRemoveAnim.targetY - innerRemoveAnim.startY) * easeT;
            const currentSize = innerRemoveAnim.startSize + (innerRemoveAnim.targetSize - innerRemoveAnim.startSize) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              data: {
                ...n.data,
                size: currentSize,
              },
              style: {
                ...n.style,
                opacity: 1 - easeT,
              },
            };
          }

          // Animate nodes to collapse to (0,0)
          const collapseAnim = collapseAnimations.find(a => a.id === n.id);
          if (collapseAnim) {
            const currentX = collapseAnim.startX + (collapseAnim.targetX - collapseAnim.startX) * easeT;
            const currentY = collapseAnim.startY + (collapseAnim.targetY - collapseAnim.startY) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
            };
          }

          // Animate loadChildren to collapse to (0,0)
          const loadCollapseAnim = loadChildrenCollapseAnimations.find(a => a.id === n.id);
          if (loadCollapseAnim) {
            const currentX = loadCollapseAnim.startX + (loadCollapseAnim.targetX - loadCollapseAnim.startX) * easeT;
            const currentY = loadCollapseAnim.startY + (loadCollapseAnim.targetY - loadCollapseAnim.startY) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
            };
          }

          // Phase 2a: Animate previously expanded child to its new position in the ring (simultaneously with phase 1)
          if (previouslyExpandedChildAnimation && n.id === previouslyExpandedChildAnimation.id) {
            const currentX = previouslyExpandedChildAnimation.startX + (previouslyExpandedChildAnimation.targetX - previouslyExpandedChildAnimation.startX) * easeT;
            const currentY = previouslyExpandedChildAnimation.startY + (previouslyExpandedChildAnimation.targetY - previouslyExpandedChildAnimation.startY) * easeT;
            const currentSize = previouslyExpandedChildAnimation.startSize + (previouslyExpandedChildAnimation.targetSize - previouslyExpandedChildAnimation.startSize) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              data: {
                ...n.data,
                size: currentSize,
              },
            };
          }

          return n;
        })
      );

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        runPhase1b();
      }
    }

    requestAnimationFrame(step);
  }

  // Phase 1b: Nodes to collapse disappear (fade out)
  function runPhase1b() {
    const startTime = performance.now();
    const nodesToRemove = [
      ...nodesToCollapse.map(n => n.id), 
      ...loadChildrenToCollapse.map(n => n.id),
      ...innerNodesToRemove.map(n => n.id)
    ];

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / phase1bDuration, 1);

      setNodes((nodes) =>
        nodes.map((n) => {
          // Only fade out ring nodes (inner nodes already faded in phase 1)
          const isRingNode = nodesToCollapse.some(node => node.id === n.id) || 
                            loadChildrenToCollapse.some(node => node.id === n.id);
          if (isRingNode && nodesToRemove.includes(n.id)) {
            return {
              ...n,
              style: {
                ...n.style,
                opacity: 1 - t,
              },
            };
          }
          return n;
        })
      );

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Remove collapsed nodes (ring nodes and inner nodes)
        setNodes((nodes) => nodes.filter(n => !nodesToRemove.includes(n.id)));
        runPhase2();
      }
    }

    requestAnimationFrame(step);
  }

  // Phase 2: New children appear (2b)
  function runPhase2() {

    // Add new children nodes and loadChildren nodes at (0,0) with scale 0
    setNodes((nodes) => {
      const existingNodeIds = new Set(nodes.map(n => n.id));
      const newChildrenToAdd = newChildrenNodes
        .filter(node => !existingNodeIds.has(node.id))
        .map(node => ({
          ...node,
          position: { x: 0, y: 0 },
          data: {
            ...node.data,
            size: 0,
          },
          style: {
            ...node.style,
            opacity: 0,
          },
        }));
      
      // Add loadChildren nodes (excluding the one for previously expanded child if it already exists)
      const loadChildrenToAdd = newLoadChildrenNodes
        .filter(node => {
          // If this is the loadChildren for previously expanded child, check if it needs to be added
          if (previouslyExpandedChild && node.id === previouslyExpandedChildLoadChildren?.id) {
            // Only add if it doesn't exist yet
            return !existingNodeIds.has(node.id);
          }
          return !existingNodeIds.has(node.id);
        })
        .map(node => ({
          ...node,
          position: { x: 0, y: 0 },
          style: {
            ...node.style,
            opacity: 0,
          },
        }));
      
      return [...nodes, ...newChildrenToAdd, ...loadChildrenToAdd];
    });

    // Update edges when new children nodes appear
    if (setEdges && newEdges) {
      setEdges(newEdges);
    }

    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / phase2Duration, 1);

      // easeInOut cubic easing
      const easeT = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      setNodes((nodes) =>
        nodes.map((n) => {
          // Phase 2b: Animate loadChildren for previously expanded child (appears with other new children)
          if (previouslyExpandedChildLoadChildren && n.id === previouslyExpandedChildLoadChildren.id) {
            // If it was just added, animate from 0,0
            const wasJustAdded = !oldNodesMap.has(n.id);
            const startX = wasJustAdded ? 0 : (previouslyExpandedChild?.oldNode?.position.x || 0);
            const startY = wasJustAdded ? 0 : (previouslyExpandedChild?.oldNode?.position.y || 0);
            const targetX = previouslyExpandedChildLoadChildren.position.x;
            const targetY = previouslyExpandedChildLoadChildren.position.y;
            
            const currentX = startX + (targetX - startX) * easeT;
            const currentY = startY + (targetY - startY) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              style: {
                ...n.style,
                opacity: wasJustAdded ? easeT : (n.style?.opacity || 1),
              },
            };
          }

          // Phase 2b: Animate new children nodes
          const anim = newChildrenAnimations.find(a => a.id === n.id);
          if (anim) {
            const currentX = anim.startX + (anim.targetX - anim.startX) * easeT;
            const currentY = anim.startY + (anim.targetY - anim.startY) * easeT;
            const currentSize = anim.startSize + (anim.targetSize - anim.startSize) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              data: {
                ...n.data,
                size: currentSize,
              },
              style: {
                ...n.style,
                opacity: easeT,
              },
            };
          }

          // Phase 2b: Animate new loadChildren nodes
          const loadAnim = newLoadChildrenAnimations.find(a => a.id === n.id);
          if (loadAnim) {
            const currentX = loadAnim.startX + (loadAnim.targetX - loadAnim.startX) * easeT;
            const currentY = loadAnim.startY + (loadAnim.targetY - loadAnim.startY) * easeT;
            return {
              ...n,
              position: { x: currentX, y: currentY },
              style: {
                ...n.style,
                opacity: easeT,
              },
            };
          }

          return n;
        })
      );

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Finalize: update nodes to match newNodes exactly
        setNodes((nodes) =>
          nodes.map((n) => {
            const newNode = newNodesMap.get(n.id);
            if (newNode) {
              return newNode;
            }
            return n;
          }).filter(n => newNodesIdSet.has(n.id))
        );
        if (onComplete) onComplete();
      }
    }

    requestAnimationFrame(step);
  }

  // Update collapsed node's zIndex and type before Phase 1 (if needed)
  setNodes((nodes) =>
    nodes.map((n) => {
      if (n.id === collapsedNodeId) {
        return {
          ...n,
          zIndex: collapsedNewNode.zIndex,
          data: {
            ...n.data,
            type: collapsedNewNode.data?.type,
            ringNumber: collapsedNewNode.data?.ringNumber,
          },
        };
      }
      // Update previously expanded child's type and zIndex before Phase 1 (for 2a animation)
      if (previouslyExpandedChild && n.id === previouslyExpandedChild.oldNode.id) {
        return {
          ...n,
          zIndex: previouslyExpandedChild.newNode.zIndex,
          data: {
            ...n.data,
            type: previouslyExpandedChild.newNode.data?.type,
            ringNumber: previouslyExpandedChild.newNode.data?.ringNumber,
            angle: previouslyExpandedChild.newNode.data?.angle,
            sliceAngle: previouslyExpandedChild.newNode.data?.sliceAngle,
          },
        };
      }
      return n;
    })
  );

  // Start Phase 1
  runPhase1();
}


// // TODO: performance can be improved by temp deleting descendant nodes and re-adding them after the animation
// // OR delete edges, apply css transforms to the nodes, and rerender the subtree nodes after the animation

// export function moveNodeToSubtreeStart(node, nodes, treeDataManager, viewState, setNodes) {
//   const track = node.data.track;
//   const siblings = treeDataManager.childrenData.get(track.parent_track_id);

//   if (!siblings || !Array.isArray(siblings) || siblings.length === 0) {
//     return;
//   }

//   if(siblings[0].id === track.id) { // already at the start of the subtree
//     return;
//   }

//   // Sort siblings array so the current track appears first
//   const sortedSiblings = [...siblings].sort((a, b) => {
//     if (a.id === track.id) return -1;
//     if (b.id === track.id) return 1;
//     return 0;
//   });

//   // Update the childrenData with the sorted array
//   treeDataManager.childrenData.set(track.parent_track_id, sortedSiblings);

//   const parentNode = nodes.find(n => n.id === 'track-' + track.parent_track_id);
//   const { nodes: newNodes } = generateRadialSubtree({node: parentNode, treeDataManager, viewState});
//   treeDataManager.recordUsage({nodes: newNodes, rendered: true});

//   //get nodes from nodes where newNodes.id is in nodes.id
//   const oldNodes = nodes.filter(n => newNodes.some(n2 => n2.id === n.id)); // TODO: handle when oldNodes.length !== newNodes.length (should be rare but possible)
//   animateNodeTransition(oldNodes, newNodes, setNodes, () => {
//     // Update angle and sliceAngle values in each node's data according to the new nodes
//     setNodes((currentNodes) =>
//       currentNodes.map((node) => {
//         const newNode = newNodes.find((n) => n.id === node.id);
//         if (newNode && newNode.data) {
//           return {
//             ...node,
//             data: {
//               ...node.data,
//               angle: newNode.data.angle,
//               sliceAngle: newNode.data.sliceAngle,
//             },
//           };
//         }
//         return node;
//       })
//     );
//   });
// }


// #endregion