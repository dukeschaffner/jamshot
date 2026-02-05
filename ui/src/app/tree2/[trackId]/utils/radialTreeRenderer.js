import { MarkerType } from 'reactflow';

import { RADIAL_TREE_CONFIG } from './config';

const { CHILDREN_LIMIT, RING_SPACING } = RADIAL_TREE_CONFIG;
// const MIN_NODE_SPACING = 150;

// #region helper functions

function radToDeg(rad) {
  return rad * (180 / Math.PI);
}

function degToRad(deg) {
  return deg * (Math.PI / 180);
}

function polarDegreesToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = degToRad(angleInDegrees);
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function polarRadiansToCartesian(centerX, centerY, radius, angleInRadians) {
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

// #endregion




// #region nodes

function createNode(trackId, x, y, trackData, selectedTrackId, ringNumber, angle, sliceAngle, handlers) {
  const node = {
    id: `track-${trackId}`,
    type: 'trackNode',
    position: { x, y },
    data: {
      track: trackData.get(trackId),
      isSelected: trackId === selectedTrackId,
      ringNumber: ringNumber,
      angle: angle,
      sliceAngle: sliceAngle,
    },
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
    const x = polarRadiansToCartesian(0, 0, RING_SPACING * (ringNumber + 0.3), angle).x;
    const y = polarRadiansToCartesian(0, 0, RING_SPACING * (ringNumber + 0.3), angle).y;
    const node = {
      id: `load-children-${trackId}`,
      type: 'clusterNode',
      position: { x, y },
      data: {
        childCount: track.collab_count,
        clusterType: 'loadChildren',
        type: 'radial',
        ringNumber: ringNumber,
      },
    };
    if(handlers) {
      node.data.onNodeClick = () => handlers.handleLoadChildrenClick(trackId);
    }
    return node;
  }
}

// #endregion





// #region tree building


function buildSubtree(
  trackId,
  treeDataManager,
  viewState,
  selectedTrackId,
  ringNumber,
  startAngle,
  endAngle,
  flowNodes,
  flowEdges,
  handlers
) {

  const children = treeDataManager.childrenData.get(trackId);
  if (children && viewState.expandedTrackIds.has(trackId)) // not a leaf node: add children nodes and edges
  {
    if (ringNumber > 4) return;
    if (children.length > CHILDREN_LIMIT) throw new Error('Too many children: ' + children.length);
  
    const radialSpacing = (endAngle - startAngle) / children.length;
    let currentAngle = startAngle + radialSpacing / 2;
  
    children.forEach(child => {
      const x = polarRadiansToCartesian(0, 0, RING_SPACING * ringNumber, currentAngle).x;
      const y = polarRadiansToCartesian(0, 0, RING_SPACING * ringNumber, currentAngle).y;
      flowNodes.push(createNode(child.id, x, y, treeDataManager.trackData, selectedTrackId, ringNumber, currentAngle, radialSpacing, handlers));
  
      // Add edge from parent to child
      flowEdges.push({
        id: `edge-${trackId}-${child.id}`,
        source: `track-${trackId}`,
        target: `track-${child.id}`,
        type: 'straight',
        animated: false,
        style: { stroke: '#86a699', strokeWidth: 2 },
        // markerEnd: {
        //   type: MarkerType.ArrowClosed,
        //   width: 20,
        //   height: 20,
        //   color: '#86a699',
        // },
      });
  
      const subtreeStartAngle = currentAngle - radialSpacing / 2;
      const subtreeEndAngle = currentAngle + radialSpacing / 2;
      buildSubtree(child.id, treeDataManager, viewState, selectedTrackId, ringNumber + 1, subtreeStartAngle, subtreeEndAngle, flowNodes, flowEdges, handlers);
      currentAngle += radialSpacing;
    });
  }
  else // leaf node: create cluster node if applicable
  {
    const angle = startAngle + (endAngle - startAngle) / 2;
    const node = createLoadChildrenNode(trackId, treeDataManager.trackData, ringNumber - 1, angle, handlers);
    if(node){
      flowNodes.push(node);
      flowEdges.push({
        id: `edge-load-children-${trackId}`,
        source: `track-${trackId}`,
        target: `load-children-${trackId}`,
        type: 'straight',
        animated: false,
        style: { stroke: '#86a699', strokeWidth: 2 },
      });
    }
  }
  

}


export function generateRadialSubtree({
  node,
  treeDataManager,
  viewState,
  selectedTrackId,
  setNodes,
  setEdges,
  handlers
}) {

  const flowNodes = [];
  const flowEdges = [];

  const track = node.data.track;
  const ringNumber = node.data.ringNumber + 1;
  const sliceAngle = node.data.sliceAngle;
  const startAngle = node.data.angle - sliceAngle / 2;
  const endAngle = node.data.angle + sliceAngle / 2;

  if (ringNumber <= 4) {
    buildSubtree(track.id, treeDataManager, viewState, selectedTrackId, ringNumber, startAngle, endAngle, flowNodes, flowEdges, handlers);
  }

  if(setNodes) {
    setNodes((nodes) => [...nodes, ...flowNodes]);
  }
  if(setEdges) {
    setEdges((edges) => [...edges, ...flowEdges]);
  }
  return {nodes: flowNodes, edges: flowEdges};
}

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
export function generateRadialTree({
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


  // Add root track node
  flowNodes.push(createNode(rootTrackId, 0, 0, trackData, selectedTrackId, 0, 0, 0, handlers));

  // Add children nodes
  const children = childrenData.get(rootTrackId);
  if (!children || children.length === 0) {
    setNodes(flowNodes);
    setEdges(flowEdges);
    return;
  }
  if (children.length > CHILDREN_LIMIT) throw new Error('Too many children: ' + children.length);
  const radialSpacing = 2 * Math.PI / children.length;
  let currentAngle = 0;


  children.forEach(child => {
    const x = polarRadiansToCartesian(0, 0, RING_SPACING, currentAngle).x;
    const y = polarRadiansToCartesian(0, 0, RING_SPACING, currentAngle).y;
    flowNodes.push(createNode(child.id, x, y, trackData, selectedTrackId, 1, currentAngle, radialSpacing, handlers));
   
    // Add edge from root to child
    flowEdges.push({
      id: `edge-${rootTrackId}-${child.id}`,
      source: `track-${rootTrackId}`,
      target: `track-${child.id}`,
      type: 'straight',
      animated: false,
      style: { stroke: '#86a699', strokeWidth: 2 },
      // markerEnd: {
      //   type: MarkerType.ArrowClosed,
      //   width: 20,
      //   height: 20,
      //   color: '#86a699',
      // },
    });

    const subtreeStartAngle = currentAngle - radialSpacing / 2;
    const subtreeEndAngle = currentAngle + radialSpacing / 2;
    buildSubtree(child.id, treeDataManager, viewState, selectedTrackId, 2, subtreeStartAngle, subtreeEndAngle, flowNodes, flowEdges, handlers);
    
    currentAngle += radialSpacing;
  });

  setNodes(flowNodes);
  setEdges(flowEdges);

  return {nodes: flowNodes, edges: flowEdges};
}

// #endregion






// #region animation functions



export function animateNode(node, setNodes, onComplete) {
  if (!setNodes) {
    console.warn('setNodes function is required for animation');
    if (onComplete) onComplete();
    return;
  }

  const startTime = performance.now();
  const duration = 500;
  const startX = node.position.x;
  const startY = node.position.y;
  const targetX = startX + 700;
  const targetY = startY;

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    // easeInOut cubic easing
    const easeT = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const currentX = startX + (targetX - startX) * easeT;
    const currentY = startY + (targetY - startY) * easeT;

    // Update node position using setNodes
    setNodes((nodes) =>
      nodes.map((n) =>
        n.id === node.id
          ? { ...n, position: { x: currentX, y: currentY } }
          : n
      )
    );

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(step);
}


export function animateNodeTransition(oldNodes, newNodes, setNodes, onComplete) {
  if (!setNodes) {
    console.warn('setNodes function is required for animation');
    if (onComplete) onComplete();
    return;
  }

  // Validate that arrays have the same length
  if (oldNodes.length !== newNodes.length) {
    throw new Error(`Node arrays have different lengths: oldNodes has ${oldNodes.length}, newNodes has ${newNodes.length}`);
  }

  // Create maps for quick lookup
  const oldNodesMap = new Map(oldNodes.map(node => [node.id, node]));
  const newNodesMap = new Map(newNodes.map(node => [node.id, node]));

  // Validate that each old node has a corresponding new node
  for (const oldNode of oldNodes) {
    if (!newNodesMap.has(oldNode.id)) {
      throw new Error(`Node with id "${oldNode.id}" exists in oldNodes but not in newNodes`);
    }
  }

  // Validate that each new node has a corresponding old node
  for (const newNode of newNodes) {
    if (!oldNodesMap.has(newNode.id)) {
      throw new Error(`Node with id "${newNode.id}" exists in newNodes but not in oldNodes`);
    }
  }

  // Create animation data for each node
  const animations = oldNodes.map(oldNode => {
    const newNode = newNodesMap.get(oldNode.id);
    return {
      id: oldNode.id,
      startX: oldNode.position.x,
      startY: oldNode.position.y,
      targetX: newNode.position.x,
      targetY: newNode.position.y,
    };
  });

  const startTime = performance.now();
  const duration = 500;

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    // easeInOut cubic easing
    const easeT = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Update all node positions using setNodes
    setNodes((nodes) =>
      nodes.map((n) => {
        const animation = animations.find(a => a.id === n.id);
        if (!animation) return n;

        const currentX = animation.startX + (animation.targetX - animation.startX) * easeT;
        const currentY = animation.startY + (animation.targetY - animation.startY) * easeT;

        return { ...n, position: { x: currentX, y: currentY } };
      })
    );

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(step);
}


// TODO: performance can be improved by temp deleting descendant nodes and re-adding them after the animation
// OR delete edges, apply css transforms to the nodes, and rerender the subtree nodes after the animation

export function moveNodeToSubtreeStart(node, nodes, treeDataManager, viewState, setNodes) {
  const track = node.data.track;
  const siblings = treeDataManager.childrenData.get(track.parent_track_id);

  if (!siblings || !Array.isArray(siblings) || siblings.length === 0) {
    return;
  }

  if(siblings[0].id === track.id) { // already at the start of the subtree
    return;
  }

  // Sort siblings array so the current track appears first
  const sortedSiblings = [...siblings].sort((a, b) => {
    if (a.id === track.id) return -1;
    if (b.id === track.id) return 1;
    return 0;
  });

  // Update the childrenData with the sorted array
  treeDataManager.childrenData.set(track.parent_track_id, sortedSiblings);

  const parentNode = nodes.find(n => n.id === 'track-' + track.parent_track_id);
  const { nodes: newNodes } = generateRadialSubtree({node: parentNode, treeDataManager, viewState});
  treeDataManager.recordUsage({nodes: newNodes, rendered: true});

  //get nodes from nodes where newNodes.id is in nodes.id
  const oldNodes = nodes.filter(n => newNodes.some(n2 => n2.id === n.id)); // TODO: handle when oldNodes.length !== newNodes.length (should be rare but possible)
  animateNodeTransition(oldNodes, newNodes, setNodes, () => {
    // Update angle and sliceAngle values in each node's data according to the new nodes
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const newNode = newNodes.find((n) => n.id === node.id);
        if (newNode && newNode.data) {
          return {
            ...node,
            data: {
              ...node.data,
              angle: newNode.data.angle,
              sliceAngle: newNode.data.sliceAngle,
            },
          };
        }
        return node;
      })
    );
  });
}


// #endregion