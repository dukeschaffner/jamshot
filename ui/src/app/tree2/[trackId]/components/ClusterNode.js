'use client';

import { memo, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import './TrackNode.module.css';
import { BASE_CLUSTER_NODE_SIZE, RADIAL_TREE_CONFIG } from '../utils/config';

const { RING_SIZE_FACTOR } = RADIAL_TREE_CONFIG;


function ClusterNode({ data }) {
  const { childCount, clusterType, onNodeClick, onNodeHover, type = 'radial', ringNumber, angle } = data;
  const nodeRef = useRef(null);
  
  // Calculate opacity for load children nodes based on angle (fade near top of circle)
  let opacity = 1;
  if (type === 'concentric' && clusterType === 'loadChildren' && angle !== undefined) {
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
        opacity = 0;
      } else {
        // Linear fade from full opacity at ±20° to transparent at ±5°
        opacity = (angleFromTop - fadeEnd) / (fadeStart - fadeEnd);
      }
    }
  }
  
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

  const handleStyle = type === 'radial' || type === 'concentric' ? radialHandleStyle : heirarchicalHandleStyle;

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
        opacity: opacity,
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
          style={handleStyle}
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
          style={handleStyle}
        />
      </div>
    </div>
  );
}

export default memo(ClusterNode);
