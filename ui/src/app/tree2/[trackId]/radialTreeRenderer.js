import { MarkerType } from 'reactflow';

const CHILDREN_LIMIT = 11;
const RING_SPACING = 300;
const MIN_NODE_SPACING = 150;

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




function createNode(trackId, x, y, trackData, nodeType, selectedTrackId, ringNumber, angle, sliceAngle, handlers) {

  return {
    id: `track-${trackId}`,
    type: nodeType,
    position: { x, y },
    data: {
      track: trackData.get(trackId),
      isSelected: trackId === selectedTrackId,
      ringNumber: ringNumber,
      angle: angle,
      sliceAngle: sliceAngle,
      onNodeClick: () => handlers.handleNodeClick(trackId),
      onNodeHover: (hovering, nodePosition) => {
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
      },
    },
  }
}



function buildSubtree(
  trackId,
  trackData,
  childrenData,
  selectedTrackId,
  ringNumber,
  startAngle,
  endAngle,
  flowNodes,
  flowEdges,
  handlers
) {

  const children = childrenData.get(trackId);
  if (!children) return;
  if (ringNumber > 4) return;
  if (children.length > CHILDREN_LIMIT) throw new Error('Too many children: ' + children.length);

  const radialSpacing = (endAngle - startAngle) / children.length;
  let currentAngle = startAngle + radialSpacing / 2;

  children.forEach(child => {
    const x = polarRadiansToCartesian(0, 0, RING_SPACING * ringNumber, currentAngle).x;
    const y = polarRadiansToCartesian(0, 0, RING_SPACING * ringNumber, currentAngle).y;
    flowNodes.push(createNode(child.id, x, y, trackData, 'trackNode', selectedTrackId, ringNumber, currentAngle, radialSpacing, handlers));

    const subtreeStartAngle = currentAngle - radialSpacing / 2;
    const subtreeEndAngle = currentAngle + radialSpacing / 2;
    buildSubtree(child.id, trackData, childrenData, selectedTrackId, ringNumber + 1, subtreeStartAngle, subtreeEndAngle, flowNodes, flowEdges, handlers);
    currentAngle += radialSpacing;
  });
}


export function generateRadialSubtreeNodesAndEdges({
  node,
  trackData,
  childrenData,
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
    buildSubtree(track.id, trackData, childrenData, selectedTrackId, ringNumber, startAngle, endAngle, flowNodes, flowEdges, handlers);
  }

  setNodes((nodes) => [...nodes, ...flowNodes]);
  setEdges((edges) => [...edges, ...flowEdges]);
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
export function generateRadialTreeNodesAndEdges({
  rootTrackId,
  trackData,
  childrenData,
  selectedTrackId,
  setNodes,
  setEdges,
  handleNodeClick,
  handleClusterNodeClick,
  setHoveredTrackId,
  setHoveredNodePosition,
  hoverTimeoutRef
}) {

  const flowNodes = [];
  const flowEdges = [];

  const handlers = {
    handleNodeClick: handleNodeClick,
    handleClusterNodeClick: handleClusterNodeClick,
    setHoveredTrackId: setHoveredTrackId,
    setHoveredNodePosition: setHoveredNodePosition,
    hoverTimeoutRef: hoverTimeoutRef,
  }


  // Add root track node
  flowNodes.push(createNode(rootTrackId, 0, 0, trackData, 'trackNode', selectedTrackId, 0, 0, 0, handlers));

  // Add children nodes
  const children = childrenData.get(rootTrackId);
  if (children.length > CHILDREN_LIMIT) throw new Error('Too many children: ' + children.length);
  const radialSpacing = 2 * Math.PI / children.length;
  let currentAngle = 0;


  children.forEach(child => {
    const x = polarRadiansToCartesian(0, 0, RING_SPACING, currentAngle).x;
    const y = polarRadiansToCartesian(0, 0, RING_SPACING, currentAngle).y;
    flowNodes.push(createNode(child.id, x, y, trackData, 'trackNode', selectedTrackId, 1, currentAngle, radialSpacing, handlers));
   

    const subtreeStartAngle = currentAngle - radialSpacing / 2;
    const subtreeEndAngle = currentAngle + radialSpacing / 2;
    buildSubtree(child.id, trackData, childrenData, selectedTrackId, 2, subtreeStartAngle, subtreeEndAngle, flowNodes, flowEdges, handlers);
    
    currentAngle += radialSpacing;
  });





  // const levelPositions = new Map(); // level -> array of x positions

  // // Calculate positions for each level
  // const levels = Array.from(structure.levels.keys()).sort((a, b) => a - b);
  // const levelHeight = 200; // Vertical spacing between levels
  // const startY = 100;

  // levels.forEach(level => {
  //   const trackIds = structure.levels.get(level);
  //   console.log('trackIds for level', level, trackIds);
  //   const collabClusterNodesForLevel = [];
  //   const otherClusterNodesForLevel = [];

  //   // Separate collab cluster nodes from other cluster nodes
  //   // Find cluster nodes for this level (parents at level-1)
  //   structure.levels.forEach((levelTrackIds, levelIndex) => {
  //     if (levelIndex === level - 1) {
  //       levelTrackIds.forEach(trackId => {
  //         // Check for all possible cluster node keys (prefixed with type)
  //         const clusterKeys = [`prev-${trackId}`, `next-${trackId}`, `collab-${trackId}`];
  //         clusterKeys.forEach(clusterKey => {
  //           if (structure.clusterNodes.has(clusterKey)) {
  //             const clusterData = structure.clusterNodes.get(clusterKey);
  //             if (typeof clusterData === 'object' && clusterData.type === 'collab') {
  //               collabClusterNodesForLevel.push(clusterKey);
  //             } else {
  //               otherClusterNodesForLevel.push(clusterKey);
  //             }
  //           }
  //         });
  //       });
  //     }
  //   });

  //   const totalNodes = trackIds.length + otherClusterNodesForLevel.length;
  //   const nodeWidth = 120; // Approximate node width
  //   const spacing = 150; // Horizontal spacing between nodes

  //   // Group children by their parent to center each group around its parent
  //   const childrenByParent = new Map();

  //   // Initialize children for each parent at level - 1
  //   if (level > 0 && structure.levels.has(level - 1)) {
  //     const parentTrackIds = structure.levels.get(level - 1);
  //     parentTrackIds.forEach(parentTrackId => {
  //       childrenByParent.set(parentTrackId, []);
  //     });
  //   }

  //   // Assign each child track to its parent
  //   trackIds.forEach(trackId => {
  //     const track = trackData.get(trackId);
  //     if (track && track.parent_track_id) {
  //       const parentId = track.parent_track_id;
  //       if (childrenByParent.has(parentId)) {
  //         childrenByParent.get(parentId).push(trackId);
  //       } else {
  //         // Fallback: if parent not found, put in a default group
  //         if (!childrenByParent.has('orphaned')) {
  //           childrenByParent.set('orphaned', []);
  //         }
  //         childrenByParent.get('orphaned').push(trackId);
  //       }
  //     }
  //   });

  //   // Assign cluster nodes to their parents
  //   otherClusterNodesForLevel.forEach(clusterKey => {
  //     const clusterData = structure.clusterNodes.get(clusterKey);
  //     const parentId = typeof clusterData === 'object' ? clusterData.parentId : clusterKey;
  //     if (childrenByParent.has(parentId)) {
  //       childrenByParent.get(parentId).push(clusterKey);
  //     } else {
  //       // Fallback
  //       if (!childrenByParent.has('orphaned')) {
  //         childrenByParent.set('orphaned', []);
  //       }
  //       childrenByParent.get('orphaned').push(clusterKey);
  //     }
  //   });

  //   // Sort children within each parent group: prevPage -> tracks -> nextPage
  //   childrenByParent.forEach((children, parentId) => {
  //     children.sort((a, b) => {
  //       const orderA = getChildSortOrder(a, structure);
  //       const orderB = getChildSortOrder(b, structure);
  //       return orderA - orderB;
  //     });
  //   });

  //   // Calculate positions for each parent group
  //   const levelPositionsArray = [];
  //   let currentX = 0;

  //   if (level === 0) {
  //     // Root level: center all nodes with dynamic spacing based on subtree widths
  //     const rootNodes = trackIds.concat(otherClusterNodesForLevel);
  //     // Sort root nodes: prevPage -> tracks -> nextPage
  //     rootNodes.sort((a, b) => {
  //       const orderA = getChildSortOrder(a, structure);
  //       const orderB = getChildSortOrder(b, structure);
  //       return orderA - orderB;
  //     });
  //     const rootWidths = rootNodes.map(nodeId => {
  //       if (structure.clusterNodes.has(nodeId)) {
  //         return nodeWidth; // Cluster nodes at root level are treated as leaf nodes
  //       } else {
  //         return calculateSubtreeWidth(nodeId, structure, trackData, nodeWidth, spacing);
  //       }
  //     });

  //     // Calculate total width and start position
  //     const totalWidth = rootWidths.reduce((sum, width, index) => {
  //       return sum + width + (index > 0 ? spacing : 0);
  //     }, 0);
  //     const startX = -totalWidth / 2;

  //     let currentX = startX;
  //     rootWidths.forEach((width, index) => {
  //       levelPositionsArray[index] = currentX + width / 2; // Center of each node
  //       currentX += width + spacing;
  //     });
  //   } else {
  //     // Child levels: position each group with dynamic spacing to prevent overlaps
  //     const parentTrackIds = Array.from(childrenByParent.keys()).filter(parentId => {
  //       const children = childrenByParent.get(parentId);
  //       return children && children.length > 0;
  //     }).sort();

  //     // Calculate subtree widths for all children groups to determine spacing
  //     const childrenGroups = parentTrackIds.map(parentId => ({
  //       parentId,
  //       children: childrenByParent.get(parentId),
  //       parentX: (() => {
  //         if (parentId === 'orphaned' || !structure.levels.has(level - 1)) return 0;
  //         const parentLevelTracks = structure.levels.get(level - 1);
  //         const parentIndex = parentLevelTracks.indexOf(parentId);
  //         if (parentIndex >= 0) {
  //           const parentLevelPositions = levelPositions.get(level - 1);
  //           return parentLevelPositions && parentLevelPositions[parentIndex] !== undefined
  //             ? parentLevelPositions[parentIndex]
  //             : 0;
  //         }
  //         return 0;
  //       })()
  //     }));

  //     // Calculate widths for each children group
  //     childrenGroups.forEach(group => {
  //       group.subtreeWidths = group.children.map(childId => {
  //         if (structure.clusterNodes.has(childId)) {
  //           return nodeWidth; // Cluster nodes are leaf nodes
  //         } else {
  //           return calculateSubtreeWidth(childId, structure, trackData, nodeWidth, spacing);
  //         }
  //       });
  //       group.totalWidth = group.subtreeWidths.reduce((sum, width, index) => {
  //         return sum + width + (index > 0 ? spacing : 0);
  //       }, 0);
  //     });

  //     // Position groups to prevent overlaps, starting from leftmost parent
  //     childrenGroups.sort((a, b) => a.parentX - b.parentX);

  //     const positionedGroups = [];
  //     let globalIndex = 0;

  //     childrenGroups.forEach(group => {
  //       // For each child in this group, position them with dynamic spacing
  //       let groupCurrentX = group.parentX - group.totalWidth / 2;

  //       group.children.forEach((childId, childIndex) => {
  //         const childWidth = group.subtreeWidths[childIndex];
  //         const childX = groupCurrentX + childWidth / 2; // Center of child node

  //         levelPositionsArray[globalIndex] = childX;
  //         globalIndex++;

  //         groupCurrentX += childWidth + spacing;
  //       });
  //     });
  //   }

  //   levelPositions.set(level, levelPositionsArray);

  //   // Add regular track nodes first
  //   console.log('adding ' + trackIds.length + ' track nodes to level ' + level);
  //   trackIds.forEach((trackId, index) => {
  //     const track = trackData.get(trackId);
  //     if (!track) return;

  //     const x = levelPositions.get(level)[index];
  //     const y = startY + level * levelHeight;

      

  //     // Add edge from parent
  //     if (track.parent_track_id) {
  //       const parentTrackId = track.parent_track_id;
  //       const parentTrack = trackData.get(parentTrackId);
  //       if (parentTrack) {
  //         // Find parent's level
  //         let parentLevel = -1;
  //         for (const [level, trackIds] of structure.levels.entries()) {
  //           if (trackIds.includes(parentTrackId)) {
  //             parentLevel = level;
  //             break;
  //           }
  //         }

  //         if (parentLevel >= 0) {
  //           const parentIndex = structure.levels.get(parentLevel).indexOf(parentTrackId);
  //           const parentX = levelPositions.get(parentLevel)[parentIndex];
  //           const parentY = startY + parentLevel * levelHeight;

  //           flowEdges.push({
  //             id: `edge-${parentTrackId}-${trackId}`,
  //             source: `track-${parentTrackId}`,
  //             target: `track-${trackId}`,
  //             type: 'default',
  //             animated: false,
  //             style: { stroke: '#86a699', strokeWidth: 2 },
  //             markerEnd: {
  //               type: MarkerType.ArrowClosed,
  //               width: 20,
  //               height: 20,
  //               color: '#86a699',
  //             },
  //           });
  //         }
  //       }
  //     }
  //   });

  //   // Add other cluster nodes (prev/next page) to the same level as regular tracks
  //   otherClusterNodesForLevel.forEach((clusterKey, clusterIndex) => {
  //     const clusterData = structure.clusterNodes.get(clusterKey);
  //     const clusterNodeIndex = trackIds.length + clusterIndex;
  //     const x = levelPositions.get(level)[clusterNodeIndex];
  //     const y = startY + level * levelHeight;

  //     // Handle different cluster node types
  //     let displayCount, clickHandler, nodeId, parentId;

  //     if (typeof clusterData === 'number') {
  //       // Legacy: simple number (old behavior)
  //       displayCount = clusterData;
  //       nodeId = `cluster-${clusterKey}`;
  //       parentId = clusterKey;
  //       clickHandler = () => handleNodeClick(clusterKey);
  //     } else {
  //       // New: object with type and count
  //       displayCount = clusterData.count;
  //       parentId = clusterData.parentId;

  //       if (clusterData.type === 'prevPage') {
  //         nodeId = `cluster-prev-${clusterKey}`;
  //         clickHandler = () => handleClusterNodeClick(clusterData.type, parentId);
  //       } else if (clusterData.type === 'nextPage') {
  //         nodeId = `cluster-next-${clusterKey}`;
  //         clickHandler = () => handleClusterNodeClick(clusterData.type, parentId);
  //       } else if (clusterData.type === 'collab') {
  //         nodeId = `cluster-collab-${clusterKey}`;
  //         clickHandler = () => handleNodeClick(parentId);
  //       } else {
  //         // Fallback
  //         nodeId = `cluster-${clusterKey}`;
  //         clickHandler = () => handleNodeClick(clusterKey);
  //       }
  //     }

  //     flowNodes.push({
  //       id: nodeId,
  //       type: 'clusterNode',
  //       position: { x, y },
  //       data: {
  //         childCount: displayCount,
  //         clusterType: typeof clusterData === 'object' ? clusterData.type : 'legacy',
  //         onNodeClick: clickHandler,
  //         onNodeHover: (hovering, nodePosition) => {
  //           // Clear any existing timeout
  //           if (hoverTimeoutRef.current) {
  //             clearTimeout(hoverTimeoutRef.current);
  //             hoverTimeoutRef.current = null;
  //           }

  //           if (hovering && nodePosition) {
  //             // Set node's screen position for popover
  //             setHoveredNodePosition(nodePosition);
  //             // Show popover immediately on hover
  //             setHoveredTrackId(parentId);
  //           } else {
  //             // Delay hiding the popover to allow mouse to move to it
  //             hoverTimeoutRef.current = setTimeout(() => {
  //               setHoveredTrackId(null);
  //               setHoveredNodePosition(null);
  //               hoverTimeoutRef.current = null;
  //             }, 200); // 200ms delay
  //           }
  //         },
  //       },
  //     });

  //     // Add edge from parent to cluster node
  //     const parentTrack = trackData.get(parentId);
  //     if (parentTrack) {
  //       let parentLevel = -1;
  //       for (const [level, trackIds] of structure.levels.entries()) {
  //         if (trackIds.includes(parentId)) {
  //           parentLevel = level;
  //           break;
  //         }
  //       }

  //       if (parentLevel >= 0) {
  //         const parentIndex = structure.levels.get(parentLevel).indexOf(parentId);
  //         const parentX = levelPositions.get(parentLevel)[parentIndex];
  //         const parentY = startY + parentLevel * levelHeight;

  //         flowEdges.push({
  //           id: `edge-${parentId}-${nodeId}`,
  //           source: `track-${parentId}`,
  //           target: nodeId,
  //           type: 'default',
  //           animated: false,
  //           style: { stroke: '#86a699', strokeWidth: 2 },
  //           markerEnd: {
  //             type: MarkerType.ArrowClosed,
  //             width: 20,
  //             height: 20,
  //             color: '#86a699',
  //           },
  //         });
  //       }
  //     }
  //   });

  //   // Add collab cluster nodes on intermediate level (directly beneath their parents)
  //   if (collabClusterNodesForLevel.length > 0) {
  //     const intermediateLevel = level - 0.5; // Position between parent level and children level
  //     const collabLevelPositions = new Map();

  //     // Group collab cluster nodes by their parent for positioning
  //     const collabNodesByParent = new Map();
  //     collabClusterNodesForLevel.forEach(clusterKey => {
  //       const clusterData = structure.clusterNodes.get(clusterKey);
  //       const parentId = clusterData.parentId;
  //       if (!collabNodesByParent.has(parentId)) {
  //         collabNodesByParent.set(parentId, []);
  //       }
  //       collabNodesByParent.get(parentId).push(clusterKey);
  //     });

  //     // Position collab cluster nodes directly beneath their parents
  //     structure.levels.get(level - 1).forEach(parentTrackId => {
  //       const collabNodes = collabNodesByParent.get(parentTrackId) || [];
  //       if (collabNodes.length > 0) {
  //         // Find parent position
  //         const parentIndex = structure.levels.get(level - 1).indexOf(parentTrackId);
  //         const parentPositions = levelPositions.get(level - 1);
  //         if (parentPositions && parentIndex >= 0) {
  //           const parentX = parentPositions[parentIndex];
  //           const parentY = startY + (level - 1) * levelHeight;

  //           // Position collab nodes below the parent
  //           collabNodes.forEach((clusterKey, nodeIndex) => {
  //             const x = parentX + (nodeIndex * 80) - ((collabNodes.length - 1) * 40); // Center multiple nodes
  //             const y = parentY + 120; // Position below parent

  //             collabLevelPositions.set(clusterKey, { x, y });

  //             const clusterData = structure.clusterNodes.get(clusterKey);
  //             let displayCount, clickHandler, nodeId;

  //             displayCount = clusterData.count;
  //             nodeId = `cluster-collab-${clusterKey}`;
  //             clickHandler = () => handleNodeClick(clusterData.parentId);

  //             flowNodes.push({
  //               id: nodeId,
  //               type: 'clusterNode',
  //               position: { x, y },
  //               data: {
  //                 childCount: displayCount,
  //                 clusterType: clusterData.type,
  //                 onNodeClick: clickHandler,
  //                 onNodeHover: (hovering, nodePosition) => {
  //                   // Clear any existing timeout
  //                   if (hoverTimeoutRef.current) {
  //                     clearTimeout(hoverTimeoutRef.current);
  //                     hoverTimeoutRef.current = null;
  //                   }

  //                   if (hovering && nodePosition) {
  //                     // Set node's screen position for popover
  //                     setHoveredNodePosition(nodePosition);
  //                     // Show popover immediately on hover
  //                     setHoveredTrackId(clusterData.parentId);
  //                   } else {
  //                     // Delay hiding the popover to allow mouse to move to it
  //                     hoverTimeoutRef.current = setTimeout(() => {
  //                       setHoveredTrackId(null);
  //                       setHoveredNodePosition(null);
  //                       hoverTimeoutRef.current = null;
  //                     }, 200); // 200ms delay
  //                   }
  //                 },
  //               },
  //             });

  //             // Add edge from parent to collab cluster node
  //             flowEdges.push({
  //               id: `edge-${parentTrackId}-${nodeId}`,
  //               source: `track-${parentTrackId}`,
  //               target: nodeId,
  //               type: 'default',
  //               animated: false,
  //               style: { stroke: '#86a699', strokeWidth: 2 },
  //               markerEnd: {
  //                 type: MarkerType.ArrowClosed,
  //                 width: 20,
  //                 height: 20,
  //                 color: '#86a699',
  //               },
  //             });
  //           });
  //         }
  //       }
  //     });
  //   }
  // });

  // // Handle collab cluster nodes for leaf nodes at the final level
  // // These wouldn't be processed in the main loop since there's no next level
  // const maxLevel = Math.max(...levels);
  // const leafCollabClusterNodes = [];

  // // Find collab cluster nodes for parents at the maximum level (leaf nodes)
  // if (structure.levels.has(maxLevel)) {
  //   structure.levels.get(maxLevel).forEach(trackId => {
  //     const clusterKey = `collab-${trackId}`;
  //     if (structure.clusterNodes.has(clusterKey)) {
  //       const clusterData = structure.clusterNodes.get(clusterKey);
  //       if (typeof clusterData === 'object' && clusterData.parentId === trackId) {
  //         leafCollabClusterNodes.push(clusterKey);
  //       } else if (typeof clusterData === 'number') {
  //         // Legacy format
  //         leafCollabClusterNodes.push(clusterKey);
  //       }
  //     }
  //   });
  // }

  // // Render collab cluster nodes for leaf nodes
  // if (leafCollabClusterNodes.length > 0) {
  //   const intermediateLevel = maxLevel + 0.5; // Position below the final level

  //   // Group collab cluster nodes by their parent for positioning
  //   const collabNodesByParent = new Map();
  //   leafCollabClusterNodes.forEach(clusterKey => {
  //     const clusterData = structure.clusterNodes.get(clusterKey);
  //     const parentId = typeof clusterData === 'object' ? clusterData.parentId : clusterKey;
  //     if (!collabNodesByParent.has(parentId)) {
  //       collabNodesByParent.set(parentId, []);
  //     }
  //     collabNodesByParent.get(parentId).push(clusterKey);
  //   });

  //   // Position collab cluster nodes directly beneath their leaf parents
  //   structure.levels.get(maxLevel).forEach(parentTrackId => {
  //     const collabNodes = collabNodesByParent.get(parentTrackId) || [];
  //     if (collabNodes.length > 0) {
  //       // Find parent position
  //       const parentIndex = structure.levels.get(maxLevel).indexOf(parentTrackId);
  //       const parentPositions = levelPositions.get(maxLevel);
  //       if (parentPositions && parentIndex >= 0) {
  //         const parentX = parentPositions[parentIndex];
  //         const parentY = startY + maxLevel * levelHeight;

  //         // Position collab nodes below the parent
  //         collabNodes.forEach((clusterKey, nodeIndex) => {
  //           const x = parentX + (nodeIndex * 80) - ((collabNodes.length - 1) * 40); // Center multiple nodes
  //           const y = parentY + 120; // Position below parent

  //           const clusterData = structure.clusterNodes.get(clusterKey);
  //           let displayCount, clickHandler, nodeId;

  //           if (typeof clusterData === 'number') {
  //             // Legacy: simple number (old behavior)
  //             displayCount = clusterData;
  //             nodeId = `cluster-collab-${clusterKey}`;
  //             clickHandler = () => handleNodeClick(clusterKey);
  //           } else {
  //             // New: object with type and count
  //             displayCount = clusterData.count;
  //             nodeId = `cluster-collab-${clusterKey}`;
  //             clickHandler = () => handleNodeClick(clusterData.parentId);
  //           }

  //           flowNodes.push({
  //             id: nodeId,
  //             type: 'clusterNode',
  //             position: { x, y },
  //             data: {
  //               childCount: displayCount,
  //               clusterType: typeof clusterData === 'object' ? clusterData.type : 'collab',
  //               onNodeClick: clickHandler,
  //               onNodeHover: (hovering, nodePosition) => {
  //                 // Clear any existing timeout
  //                 if (hoverTimeoutRef.current) {
  //                   clearTimeout(hoverTimeoutRef.current);
  //                   hoverTimeoutRef.current = null;
  //                 }

  //                 if (hovering && nodePosition) {
  //                   // Set node's screen position for popover
  //                   setHoveredNodePosition(nodePosition);
  //                   // Show popover immediately on hover
  //                   setHoveredTrackId(typeof clusterData === 'object' ? clusterData.parentId : clusterKey);
  //                 } else {
  //                   // Delay hiding the popover to allow mouse to move to it
  //                   hoverTimeoutRef.current = setTimeout(() => {
  //                     setHoveredTrackId(null);
  //                     setHoveredNodePosition(null);
  //                     hoverTimeoutRef.current = null;
  //                   }, 200); // 200ms delay
  //                 }
  //               },
  //             },
  //           });

  //           // Add edge from parent to collab cluster node
  //           flowEdges.push({
  //             id: `edge-${parentTrackId}-${nodeId}`,
  //             source: `track-${parentTrackId}`,
  //             target: nodeId,
  //             type: 'default',
  //             animated: false,
  //             style: { stroke: '#86a699', strokeWidth: 2 },
  //             markerEnd: {
  //               type: MarkerType.ArrowClosed,
  //               width: 20,
  //               height: 20,
  //               color: '#86a699',
  //             },
  //           });
  //         });
  //       }
  //     }
  //   });
  // }

  setNodes(flowNodes);
  setEdges(flowEdges);
}
