import { MarkerType } from 'reactflow';

// Hierarchical Tree Renderer
// Generates React Flow nodes and edges for a hierarchical tree layout

/**
 * Determines the sort order for children within a parent group
 * prevPage clusters -> track nodes -> nextPage clusters
 * @param {string} childId - The child node ID
 * @param {Object} structure - Tree structure containing clusterNodes
 * @returns {number} Sort order (lower numbers come first)
 */
function getChildSortOrder(childId, structure) {
  // Check if this is a cluster node
  if (structure.clusterNodes.has(childId)) {
    const clusterData = structure.clusterNodes.get(childId);
    if (typeof clusterData === 'object') {
      if (clusterData.type === 'prevPage') return 0; // prevPage clusters first
      if (clusterData.type === 'nextPage') return 2; // nextPage clusters last
    }
    // Legacy cluster or unknown type
    if (childId.startsWith('prev-')) return 0;
    if (childId.startsWith('next-')) return 2;
    return 1; // other clusters in middle
  }
  // Regular track nodes in the middle
  return 1;
}

/**
 * Calculates the total width required for a node's subtree
 * @param {string} nodeId - The node ID to calculate subtree width for
 * @param {Object} structure - Tree structure containing levels and clusterNodes
 * @param {Map} trackData - Map of trackId -> track data
 * @param {number} nodeWidth - Width of individual nodes
 * @param {number} minSpacing - Minimum spacing between nodes
 * @returns {number} Total width required for the subtree
 */
function calculateSubtreeWidth(nodeId, structure, trackData, nodeWidth = 120, minSpacing = 150) {
  // Get direct children of this node
  const directChildren = [];

  // Find children in the next level
  const nodeLevel = Array.from(structure.levels.entries()).find(([level, trackIds]) =>
    trackIds.includes(nodeId)
  )?.[0];

  if (nodeLevel !== undefined && structure.levels.has(nodeLevel + 1)) {
    const nextLevelTracks = structure.levels.get(nodeLevel + 1);
    nextLevelTracks.forEach(trackId => {
      const track = trackData.get(trackId);
      if (track && track.parent_track_id === nodeId) {
        directChildren.push(trackId);
      }
    });
  }

  // Add cluster nodes for this parent
  const clusterKeys = [`prev-${nodeId}`, `next-${nodeId}`, `collab-${nodeId}`];
  clusterKeys.forEach(clusterKey => {
    if (structure.clusterNodes.has(clusterKey)) {
      const clusterData = structure.clusterNodes.get(clusterKey);
      if (typeof clusterData === 'object' && clusterData.parentId === nodeId) {
        directChildren.push(clusterKey);
      } else if (typeof clusterData === 'number') {
        // Legacy format
        directChildren.push(clusterKey);
      }
    }
  });

  if (directChildren.length === 0) {
    // Leaf node - just return node width
    return nodeWidth;
  }

  // Calculate width of all children subtrees
  const childrenWidths = directChildren.map(childId => {
    if (structure.clusterNodes.has(childId)) {
      // Cluster nodes are leaf nodes for width calculation
      return nodeWidth;
    } else {
      // Recursively calculate subtree width for track nodes
      return calculateSubtreeWidth(childId, structure, trackData, nodeWidth, minSpacing);
    }
  });

  // Total width needed is sum of all children widths plus spacing between them
  const totalChildrenWidth = childrenWidths.reduce((sum, width) => sum + width, 0);
  const totalSpacing = (directChildren.length - 1) * minSpacing;
  const subtreeWidth = totalChildrenWidth + totalSpacing;

  // Ensure subtree width is at least the node width (for centering)
  return Math.max(subtreeWidth, nodeWidth);
}

/**
 * Generates React Flow nodes and edges from tree structure using a hierarchical layout
 * @param {Object} params - Parameters for rendering
 * @param {Object} params.structure - Tree structure from buildTreeStructure()
 * @param {Map} params.trackData - Map of trackId -> track data
 * @param {string} params.selectedTrackId - Currently selected track ID
 * @param {Function} params.setNodes - React Flow setNodes function
 * @param {Function} params.setEdges - React Flow setEdges function
 * @param {Function} params.handleNodeClick - Function to handle node clicks
 * @param {Function} params.handleClusterNodeClick - Function to handle cluster node clicks
 * @param {Function} params.setHoveredTrackId - Function to set hovered track ID
 * @param {Function} params.setHoveredNodePosition - Function to set hovered node position
 * @param {Object} params.hoverTimeoutRef - Reference to hover timeout
 */
export function generateHierarchicalTreeNodesAndEdges({
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
}) {
  if (structure.nodes.length === 0 && structure.levels.size === 0 && structure.clusterNodes.size === 0) return;

  const flowNodes = [];
  const flowEdges = [];
  const levelPositions = new Map(); // level -> array of x positions

  // Calculate positions for each level
  const levels = Array.from(structure.levels.keys()).sort((a, b) => a - b);
  const levelHeight = 200; // Vertical spacing between levels
  const startY = 100;

  levels.forEach(level => {
    const trackIds = structure.levels.get(level);
    console.log('trackIds for level', level, trackIds);
    const collabClusterNodesForLevel = [];
    const otherClusterNodesForLevel = [];

    // Separate collab cluster nodes from other cluster nodes
    // Find cluster nodes for this level (parents at level-1)
    structure.levels.forEach((levelTrackIds, levelIndex) => {
      if (levelIndex === level - 1) {
        levelTrackIds.forEach(trackId => {
          // Check for all possible cluster node keys (prefixed with type)
          const clusterKeys = [`prev-${trackId}`, `next-${trackId}`, `collab-${trackId}`];
          clusterKeys.forEach(clusterKey => {
            if (structure.clusterNodes.has(clusterKey)) {
              const clusterData = structure.clusterNodes.get(clusterKey);
              if (typeof clusterData === 'object' && clusterData.type === 'collab') {
                collabClusterNodesForLevel.push(clusterKey);
              } else {
                otherClusterNodesForLevel.push(clusterKey);
              }
            }
          });
        });
      }
    });

    const totalNodes = trackIds.length + otherClusterNodesForLevel.length;
    const nodeWidth = 120; // Approximate node width
    const spacing = 150; // Horizontal spacing between nodes

    // Group children by their parent to center each group around its parent
    const childrenByParent = new Map();

    // Initialize children for each parent at level - 1
    if (level > 0 && structure.levels.has(level - 1)) {
      const parentTrackIds = structure.levels.get(level - 1);
      parentTrackIds.forEach(parentTrackId => {
        childrenByParent.set(parentTrackId, []);
      });
    }

    // Assign each child track to its parent
    trackIds.forEach(trackId => {
      const track = trackData.get(trackId);
      if (track && track.parent_track_id) {
        const parentId = track.parent_track_id;
        if (childrenByParent.has(parentId)) {
          childrenByParent.get(parentId).push(trackId);
        } else {
          // Fallback: if parent not found, put in a default group
          if (!childrenByParent.has('orphaned')) {
            childrenByParent.set('orphaned', []);
          }
          childrenByParent.get('orphaned').push(trackId);
        }
      }
    });

    // Assign cluster nodes to their parents
    otherClusterNodesForLevel.forEach(clusterKey => {
      const clusterData = structure.clusterNodes.get(clusterKey);
      const parentId = typeof clusterData === 'object' ? clusterData.parentId : clusterKey;
      if (childrenByParent.has(parentId)) {
        childrenByParent.get(parentId).push(clusterKey);
      } else {
        // Fallback
        if (!childrenByParent.has('orphaned')) {
          childrenByParent.set('orphaned', []);
        }
        childrenByParent.get('orphaned').push(clusterKey);
      }
    });

    // Sort children within each parent group: prevPage -> tracks -> nextPage
    childrenByParent.forEach((children, parentId) => {
      children.sort((a, b) => {
        const orderA = getChildSortOrder(a, structure);
        const orderB = getChildSortOrder(b, structure);
        return orderA - orderB;
      });
    });

    // Calculate positions for each parent group
    const levelPositionsArray = [];
    let currentX = 0;

    if (level === 0) {
      // Root level: center all nodes with dynamic spacing based on subtree widths
      const rootNodes = trackIds.concat(otherClusterNodesForLevel);
      // Sort root nodes: prevPage -> tracks -> nextPage
      rootNodes.sort((a, b) => {
        const orderA = getChildSortOrder(a, structure);
        const orderB = getChildSortOrder(b, structure);
        return orderA - orderB;
      });
      const rootWidths = rootNodes.map(nodeId => {
        if (structure.clusterNodes.has(nodeId)) {
          return nodeWidth; // Cluster nodes at root level are treated as leaf nodes
        } else {
          return calculateSubtreeWidth(nodeId, structure, trackData, nodeWidth, spacing);
        }
      });

      // Calculate total width and start position
      const totalWidth = rootWidths.reduce((sum, width, index) => {
        return sum + width + (index > 0 ? spacing : 0);
      }, 0);
      const startX = -totalWidth / 2;

      let currentX = startX;
      rootWidths.forEach((width, index) => {
        levelPositionsArray[index] = currentX + width / 2; // Center of each node
        currentX += width + spacing;
      });
    } else {
      // Child levels: position each group with dynamic spacing to prevent overlaps
      const parentTrackIds = Array.from(childrenByParent.keys()).filter(parentId => {
        const children = childrenByParent.get(parentId);
        return children && children.length > 0;
      }).sort();

      // Calculate subtree widths for all children groups to determine spacing
      const childrenGroups = parentTrackIds.map(parentId => ({
        parentId,
        children: childrenByParent.get(parentId),
        parentX: (() => {
          if (parentId === 'orphaned' || !structure.levels.has(level - 1)) return 0;
          const parentLevelTracks = structure.levels.get(level - 1);
          const parentIndex = parentLevelTracks.indexOf(parentId);
          if (parentIndex >= 0) {
            const parentLevelPositions = levelPositions.get(level - 1);
            return parentLevelPositions && parentLevelPositions[parentIndex] !== undefined
              ? parentLevelPositions[parentIndex]
              : 0;
          }
          return 0;
        })()
      }));

      // Calculate widths for each children group
      childrenGroups.forEach(group => {
        group.subtreeWidths = group.children.map(childId => {
          if (structure.clusterNodes.has(childId)) {
            return nodeWidth; // Cluster nodes are leaf nodes
          } else {
            return calculateSubtreeWidth(childId, structure, trackData, nodeWidth, spacing);
          }
        });
        group.totalWidth = group.subtreeWidths.reduce((sum, width, index) => {
          return sum + width + (index > 0 ? spacing : 0);
        }, 0);
      });

      // Position groups to prevent overlaps, starting from leftmost parent
      childrenGroups.sort((a, b) => a.parentX - b.parentX);

      const positionedGroups = [];
      let globalIndex = 0;

      childrenGroups.forEach(group => {
        // For each child in this group, position them with dynamic spacing
        let groupCurrentX = group.parentX - group.totalWidth / 2;

        group.children.forEach((childId, childIndex) => {
          const childWidth = group.subtreeWidths[childIndex];
          const childX = groupCurrentX + childWidth / 2; // Center of child node

          levelPositionsArray[globalIndex] = childX;
          globalIndex++;

          groupCurrentX += childWidth + spacing;
        });
      });
    }

    levelPositions.set(level, levelPositionsArray);

    // Add regular track nodes first
    console.log('adding ' + trackIds.length + ' track nodes to level ' + level);
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

    // Add other cluster nodes (prev/next page) to the same level as regular tracks
    otherClusterNodesForLevel.forEach((clusterKey, clusterIndex) => {
      const clusterData = structure.clusterNodes.get(clusterKey);
      const clusterNodeIndex = trackIds.length + clusterIndex;
      const x = levelPositions.get(level)[clusterNodeIndex];
      const y = startY + level * levelHeight;

      // Handle different cluster node types
      let displayCount, clickHandler, nodeId, parentId;

      if (typeof clusterData === 'number') {
        // Legacy: simple number (old behavior)
        displayCount = clusterData;
        nodeId = `cluster-${clusterKey}`;
        parentId = clusterKey;
        clickHandler = () => handleNodeClick(clusterKey);
      } else {
        // New: object with type and count
        displayCount = clusterData.count;
        parentId = clusterData.parentId;

        if (clusterData.type === 'prevPage') {
          nodeId = `cluster-prev-${clusterKey}`;
          clickHandler = () => handleClusterNodeClick(clusterData.type, parentId);
        } else if (clusterData.type === 'nextPage') {
          nodeId = `cluster-next-${clusterKey}`;
          clickHandler = () => handleClusterNodeClick(clusterData.type, parentId);
        } else if (clusterData.type === 'collab') {
          nodeId = `cluster-collab-${clusterKey}`;
          clickHandler = () => handleNodeClick(parentId);
        } else {
          // Fallback
          nodeId = `cluster-${clusterKey}`;
          clickHandler = () => handleNodeClick(clusterKey);
        }
      }

      flowNodes.push({
        id: nodeId,
        type: 'clusterNode',
        position: { x, y },
        data: {
          childCount: displayCount,
          clusterType: typeof clusterData === 'object' ? clusterData.type : 'legacy',
          type: 'hierarchical',
          onNodeClick: clickHandler,
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
              setHoveredTrackId(parentId);
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

      // Add edge from parent to cluster node
      const parentTrack = trackData.get(parentId);
      if (parentTrack) {
        let parentLevel = -1;
        for (const [level, trackIds] of structure.levels.entries()) {
          if (trackIds.includes(parentId)) {
            parentLevel = level;
            break;
          }
        }

        if (parentLevel >= 0) {
          const parentIndex = structure.levels.get(parentLevel).indexOf(parentId);
          const parentX = levelPositions.get(parentLevel)[parentIndex];
          const parentY = startY + parentLevel * levelHeight;

          flowEdges.push({
            id: `edge-${parentId}-${nodeId}`,
            source: `track-${parentId}`,
            target: nodeId,
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
    });

    // Add collab cluster nodes on intermediate level (directly beneath their parents)
    if (collabClusterNodesForLevel.length > 0) {
      const intermediateLevel = level - 0.5; // Position between parent level and children level
      const collabLevelPositions = new Map();

      // Group collab cluster nodes by their parent for positioning
      const collabNodesByParent = new Map();
      collabClusterNodesForLevel.forEach(clusterKey => {
        const clusterData = structure.clusterNodes.get(clusterKey);
        const parentId = clusterData.parentId;
        if (!collabNodesByParent.has(parentId)) {
          collabNodesByParent.set(parentId, []);
        }
        collabNodesByParent.get(parentId).push(clusterKey);
      });

      // Position collab cluster nodes directly beneath their parents
      structure.levels.get(level - 1).forEach(parentTrackId => {
        const collabNodes = collabNodesByParent.get(parentTrackId) || [];
        if (collabNodes.length > 0) {
          // Find parent position
          const parentIndex = structure.levels.get(level - 1).indexOf(parentTrackId);
          const parentPositions = levelPositions.get(level - 1);
          if (parentPositions && parentIndex >= 0) {
            const parentX = parentPositions[parentIndex];
            const parentY = startY + (level - 1) * levelHeight;

            // Position collab nodes below the parent
            collabNodes.forEach((clusterKey, nodeIndex) => {
              const x = parentX + (nodeIndex * 80) - ((collabNodes.length - 1) * 40); // Center multiple nodes
              const y = parentY + 120; // Position below parent

              collabLevelPositions.set(clusterKey, { x, y });

              const clusterData = structure.clusterNodes.get(clusterKey);
              let displayCount, clickHandler, nodeId;

              displayCount = clusterData.count;
              nodeId = `cluster-collab-${clusterKey}`;
              clickHandler = () => handleNodeClick(clusterData.parentId);

              flowNodes.push({
                id: nodeId,
                type: 'clusterNode',
                position: { x, y },
                data: {
                  childCount: displayCount,
                  clusterType: clusterData.type,
                  type: 'hierarchical',
                  onNodeClick: clickHandler,
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
                      setHoveredTrackId(clusterData.parentId);
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

              // Add edge from parent to collab cluster node
              flowEdges.push({
                id: `edge-${parentTrackId}-${nodeId}`,
                source: `track-${parentTrackId}`,
                target: nodeId,
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
            });
          }
        }
      });
    }
  });

  // Handle collab cluster nodes for leaf nodes at the final level
  // These wouldn't be processed in the main loop since there's no next level
  const maxLevel = Math.max(...levels);
  const leafCollabClusterNodes = [];

  // Find collab cluster nodes for parents at the maximum level (leaf nodes)
  if (structure.levels.has(maxLevel)) {
    structure.levels.get(maxLevel).forEach(trackId => {
      const clusterKey = `collab-${trackId}`;
      if (structure.clusterNodes.has(clusterKey)) {
        const clusterData = structure.clusterNodes.get(clusterKey);
        if (typeof clusterData === 'object' && clusterData.parentId === trackId) {
          leafCollabClusterNodes.push(clusterKey);
        } else if (typeof clusterData === 'number') {
          // Legacy format
          leafCollabClusterNodes.push(clusterKey);
        }
      }
    });
  }

  // Render collab cluster nodes for leaf nodes
  if (leafCollabClusterNodes.length > 0) {
    const intermediateLevel = maxLevel + 0.5; // Position below the final level

    // Group collab cluster nodes by their parent for positioning
    const collabNodesByParent = new Map();
    leafCollabClusterNodes.forEach(clusterKey => {
      const clusterData = structure.clusterNodes.get(clusterKey);
      const parentId = typeof clusterData === 'object' ? clusterData.parentId : clusterKey;
      if (!collabNodesByParent.has(parentId)) {
        collabNodesByParent.set(parentId, []);
      }
      collabNodesByParent.get(parentId).push(clusterKey);
    });

    // Position collab cluster nodes directly beneath their leaf parents
    structure.levels.get(maxLevel).forEach(parentTrackId => {
      const collabNodes = collabNodesByParent.get(parentTrackId) || [];
      if (collabNodes.length > 0) {
        // Find parent position
        const parentIndex = structure.levels.get(maxLevel).indexOf(parentTrackId);
        const parentPositions = levelPositions.get(maxLevel);
        if (parentPositions && parentIndex >= 0) {
          const parentX = parentPositions[parentIndex];
          const parentY = startY + maxLevel * levelHeight;

          // Position collab nodes below the parent
          collabNodes.forEach((clusterKey, nodeIndex) => {
            const x = parentX + (nodeIndex * 80) - ((collabNodes.length - 1) * 40); // Center multiple nodes
            const y = parentY + 120; // Position below parent

            const clusterData = structure.clusterNodes.get(clusterKey);
            let displayCount, clickHandler, nodeId;

            if (typeof clusterData === 'number') {
              // Legacy: simple number (old behavior)
              displayCount = clusterData;
              nodeId = `cluster-collab-${clusterKey}`;
              clickHandler = () => handleNodeClick(clusterKey);
            } else {
              // New: object with type and count
              displayCount = clusterData.count;
              nodeId = `cluster-collab-${clusterKey}`;
              clickHandler = () => handleNodeClick(clusterData.parentId);
            }

            flowNodes.push({
              id: nodeId,
              type: 'clusterNode',
              position: { x, y },
              data: {
                childCount: displayCount,
                clusterType: typeof clusterData === 'object' ? clusterData.type : 'collab',
                type: 'hierarchical',
                onNodeClick: clickHandler,
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
                    setHoveredTrackId(typeof clusterData === 'object' ? clusterData.parentId : clusterKey);
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

            // Add edge from parent to collab cluster node
            flowEdges.push({
              id: `edge-${parentTrackId}-${nodeId}`,
              source: `track-${parentTrackId}`,
              target: nodeId,
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
          });
        }
      }
    });
  }

  setNodes(flowNodes);
  setEdges(flowEdges);
}
