'use client';

import { memo, useRef } from 'react';
import { Handle, Position } from 'reactflow';
import './TrackNode.module.css';
import { BASE_CLUSTER_NODE_SIZE, RADIAL_TREE_CONFIG } from '../utils/config';

const { RING_SIZE_FACTOR } = RADIAL_TREE_CONFIG;


function ClusterNode({ data }) {
  const { childCount, clusterType, onNodeClick, onNodeHover, type = 'radial', ringNumber } = data;
  const nodeRef = useRef(null);
  
  const baseSize = BASE_CLUSTER_NODE_SIZE;
  let ringSizeFactor = 1;
  let size = baseSize;
  if (type === 'radial') {
    ringSizeFactor = Math.max(.1, 1 - (ringNumber || 0) * RING_SIZE_FACTOR);
    size = baseSize * ringSizeFactor;
  }

  const radialHandleStyle = {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 1,
    height: 1,
    background: 'transparent',
    border: 'none',
  };

  const heirarchicalHandleStyle = {
    visibility: 'hidden',
  };

  return (
    <div
      ref={nodeRef}
      onClick={onNodeClick}
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
      }}
    >
      <div
        className="track-node"
        style={{
          width: baseSize,
          height: baseSize,
          transform: type === 'radial' ? `scale(${ringSizeFactor})` : '',
          transformOrigin: 'center center',
          flexShrink: 0,
          backgroundColor: '#808080', // Grey color for cluster nodes
          borderRadius: '50%',
          position: 'relative',
          cursor: 'pointer',
          border: `2px solid var(--grey-3)`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold',
          color: 'white',
        }}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={type === 'radial' ? radialHandleStyle : heirarchicalHandleStyle}
        />

        <span>
          {clusterType === 'prevPage' && '<'}
          {clusterType === 'nextPage' && '>'}
          {clusterType === 'loadChildren' && '+'}
          {childCount}
        </span>

        <Handle
          type="source"
          position={Position.Bottom}
          style={type === 'radial' ? radialHandleStyle : heirarchicalHandleStyle}
        />
      </div>
    </div>
  );
}

export default memo(ClusterNode);
