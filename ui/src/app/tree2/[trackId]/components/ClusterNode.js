'use client';

import { memo, useRef } from 'react';
import { Handle, Position, useViewport } from 'reactflow';
import './TrackNode.module.css';

function ClusterNode({ data }) {
  const { childCount, clusterType = 'legacy', onNodeClick, onNodeHover } = data;
  const nodeRef = useRef(null);
  const { zoom } = useViewport();
  const baseSize = 45; // Base size for nodes at zoom level 1
  // Reduce scaling effect when zoomed out (zoom < 1), full effect when zoomed in (zoom >= 1)
  const effectiveZoom = zoom >= 1 ? zoom : 1 + (zoom - 1) * 0.3;
  const size = baseSize / effectiveZoom;

  const handleMouseEnter = () => {
    if (onNodeHover && nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      onNodeHover(true, {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height,
      });
    }
  };

  const handleMouseLeave = () => {
    if (onNodeHover) {
      onNodeHover(false, null);
    }
  };

  return (
    <div
      ref={nodeRef}
      className="track-node"
      style={{
        width: size,
        height: size,
        backgroundColor: '#808080', // Grey color for cluster nodes
        borderRadius: '50%',
        position: 'relative',
        cursor: 'pointer',
        border: `${2 / effectiveZoom}px solid var(--grey-3)`,
        boxShadow: `0 ${2 / effectiveZoom}px ${8 / effectiveZoom}px rgba(0, 0, 0, 0.15)`,
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${14 / effectiveZoom}px`,
        fontWeight: 'bold',
        color: 'white',
      }}
      onClick={onNodeClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ visibility: 'hidden' }}
      />

      <span>
        {clusterType === 'prevPage' && '<'}
        {clusterType === 'nextPage' && '>'}
        {clusterType === 'collab' && '+'}
        {clusterType === 'legacy' && '+'}
        {childCount}
      </span>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ visibility: 'hidden' }}
      />
    </div>
  );
}

export default memo(ClusterNode);
