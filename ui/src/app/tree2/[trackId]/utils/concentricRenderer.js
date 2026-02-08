import { BASE_NODE_SIZE, BASE_CLUSTER_NODE_SIZE, CONCENTRIC_CONFIG } from './config';
import { polarRadiansToCartesian } from './renderUtils';

const { OUTER_RING_RADIUS, CHILDREN_LIMIT, BASE_RING_SIZE, RING_SPACING } = CONCENTRIC_CONFIG;
// const { CHILDREN_LIMIT, RING_SPACING } = CONCENTRIC_CONFIG;






// #region nodes

function createNode(trackId, type, x, y, trackData, selectedTrackId, ringNumber, angle, sliceAngle, handlers) {
  let size;
  if(type === 'concentricNode') {
    size = BASE_RING_SIZE + ringNumber * RING_SPACING;
  }
  else if (type === 'trackNode') {
    size = BASE_NODE_SIZE;
  }
  x = x - size / 2;
  y = y - size / 2;
  const node = {
    id: `track-${trackId}`,
    type: type,
    position: { x, y },
    data: {
      track: trackData.get(trackId),
      isSelected: trackId === selectedTrackId,
      ringNumber: ringNumber,
      angle: angle,
      sliceAngle: sliceAngle,
      type: 'concentric',
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


function createLoadChildrenNode(trackId, trackData, ringNumber, angle, handlers) {
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
        type: 'radial',
        ringNumber: ringNumber,
        type: 'concentric',
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
  hoverTimeoutRef
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
    flowNodes.push(createNode(currentTrackId, 'concentricNode', 0, 0, trackData, selectedTrackId, ringNumber, 0, 0, handlers));
    previousTrackId = currentTrackId;
    ringNumber++;

    // Add children nodes
    const children = childrenData.get(currentTrackId);
    if (!children || children.length === 0) {
      done = true;
      break;
    }
    if (children.length > CHILDREN_LIMIT) throw new Error('Too many children: ' + children.length);

    const expandedChild = children.find(child => viewState.expandedTrackIds.has(child.id));
    if(!expandedChild) {
      done = true;
      break;
    }
    currentTrackId = expandedChild.id;
  }



  const children = childrenData.get(previousTrackId);

  let currentAngle = 0;
  let radialSpacing = 2 * Math.PI / children.length;

  if(children) {
    children.forEach(child => {
      const x = polarRadiansToCartesian(0, 0, OUTER_RING_RADIUS, currentAngle).x;
      const y = polarRadiansToCartesian(0, 0, OUTER_RING_RADIUS, currentAngle).y;
      flowNodes.push(createNode(child.id, 'trackNode', x, y, trackData, selectedTrackId, 1, currentAngle, radialSpacing, handlers));
    
      // Add edge from root to child
      flowEdges.push({
        id: `edge-${rootTrackId}-${child.id}`,
        source: `track-${rootTrackId}`,
        target: `track-${child.id}`,
        type: 'straight',
        animated: false,
        style: { stroke: '#86a699', strokeWidth: 2 },
      });

      // 

      const node = createLoadChildrenNode(child.id, treeDataManager.trackData, 1, currentAngle, handlers);
      if(node){
        flowNodes.push(node);
        flowEdges.push({
          id: `edge-load-children-${child.id}`,
          source: `track-${child.id}`,
          target: `load-children-${child.id}`,
          type: 'straight',
          animated: false,
          style: { stroke: '#86a699', strokeWidth: 2 },
        });
      }

      currentAngle += radialSpacing;
    });
  }

  setNodes(flowNodes);
  setEdges(flowEdges);

  return {nodes: flowNodes, edges: flowEdges};
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


// export function animateNodeTransition(oldNodes, newNodes, setNodes, onComplete) {
//   if (!setNodes) {
//     console.warn('setNodes function is required for animation');
//     if (onComplete) onComplete();
//     return;
//   }

//   // Validate that arrays have the same length
//   if (oldNodes.length !== newNodes.length) {
//     throw new Error(`Node arrays have different lengths: oldNodes has ${oldNodes.length}, newNodes has ${newNodes.length}`);
//   }

//   // Create maps for quick lookup
//   const oldNodesMap = new Map(oldNodes.map(node => [node.id, node]));
//   const newNodesMap = new Map(newNodes.map(node => [node.id, node]));

//   // Validate that each old node has a corresponding new node
//   for (const oldNode of oldNodes) {
//     if (!newNodesMap.has(oldNode.id)) {
//       throw new Error(`Node with id "${oldNode.id}" exists in oldNodes but not in newNodes`);
//     }
//   }

//   // Validate that each new node has a corresponding old node
//   for (const newNode of newNodes) {
//     if (!oldNodesMap.has(newNode.id)) {
//       throw new Error(`Node with id "${newNode.id}" exists in newNodes but not in oldNodes`);
//     }
//   }

//   // Create animation data for each node
//   const animations = oldNodes.map(oldNode => {
//     const newNode = newNodesMap.get(oldNode.id);
//     return {
//       id: oldNode.id,
//       startX: oldNode.position.x,
//       startY: oldNode.position.y,
//       targetX: newNode.position.x,
//       targetY: newNode.position.y,
//     };
//   });

//   const startTime = performance.now();
//   const duration = 500;

//   function step(now) {
//     const elapsed = now - startTime;
//     const t = Math.min(elapsed / duration, 1);

//     // easeInOut cubic easing
//     const easeT = t < 0.5
//       ? 4 * t * t * t
//       : 1 - Math.pow(-2 * t + 2, 3) / 2;

//     // Update all node positions using setNodes
//     setNodes((nodes) =>
//       nodes.map((n) => {
//         const animation = animations.find(a => a.id === n.id);
//         if (!animation) return n;

//         const currentX = animation.startX + (animation.targetX - animation.startX) * easeT;
//         const currentY = animation.startY + (animation.targetY - animation.startY) * easeT;

//         return { ...n, position: { x: currentX, y: currentY } };
//       })
//     );

//     if (t < 1) {
//       requestAnimationFrame(step);
//     } else {
//       if (onComplete) onComplete();
//     }
//   }

//   requestAnimationFrame(step);
// }


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