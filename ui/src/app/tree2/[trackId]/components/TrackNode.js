'use client';

import { memo, useRef } from 'react';
import { Handle, Position, useViewport } from 'reactflow';
import Image from 'next/image';
import { FaCheckCircle } from 'react-icons/fa';
import { getTrackColor } from '../utils/trackColorUtils';
import styles from '../TreeView.module.css';
import { BASE_NODE_SIZE, RADIAL_TREE_CONFIG } from '../utils/config';

const { RING_SIZE_FACTOR } = RADIAL_TREE_CONFIG;

function TrackNode({ data }) {
  const { track, isSelected, onNodeClick, onNodeHover, ringNumber, type = 'radial' } = data;
  const nodeRef = useRef(null);
  // const { zoom } = useViewport();
  // Slightly decrease size with ring number (5% reduction per ring)
  
  // Reduce scaling effect when zoomed out (zoom < 1), full effect when zoomed in (zoom >= 1)
  //const effectiveZoom = zoom >= 1 ? zoom : 1 + (zoom - 1) * 0.3;
  // const effectiveZoom = 1/ringSizeFactor;
  // const size = adjustedBaseSize / effectiveZoom;
  let ringSizeFactor = 1;
  const baseSize = BASE_NODE_SIZE;
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

  const color = track ? getTrackColor(track) : 'var(--grey-2)'; // Color based on popularity and plays

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
    onClick={onNodeClick}
    onMouseEnter={handleMouseEnter}
    onMouseLeave={handleMouseLeave}
    className={styles.nodeHover}
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
      className={`track-node ${isSelected ? 'selected' : ''}`}
      style={{
        width: baseSize,
        height: baseSize,
        transform: type === 'radial' ? `scale(${ringSizeFactor})` : '',
        transformOrigin: 'center center',
        flexShrink: 0,
        backgroundColor: color,
        borderRadius: '50%',
        position: 'relative',
        cursor: 'pointer',
        border: isSelected ? `3px solid var(--seafoam)` : `2px solid var(--grey-3)`,
        boxShadow: isSelected 
          ? '0 0 20px rgba(147, 233, 190, 0.5)' 
          : '0 2px 8px rgba(0, 0, 0, 0.15)',
        transition: 'all 0.2s ease',
      }}

    >
      <Handle
        type="target"
        position={Position.Top}
        style={handleStyle}
      />
      
      {/* Avatar overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '-5px',
          right: '-5px',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: '2px solid var(--background)',
          overflow: 'hidden',
          backgroundColor: 'var(--grey-1)',
        }}
      >
        <Image
          src={track?.profile_pic_url || '/avatar.svg'}
          alt={track?.username || 'Artist'}
          width={28}
          height={28}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>
      {track?.verified && (
        <div
          style={{
            position: 'absolute',
            bottom: '-7px',
            right: '-7px',
            color: 'var(--seafoam)',
            backgroundColor: 'var(--background)',
            borderRadius: '50%',
            width: '14px',
            height: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FaCheckCircle size={10.5} />
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={handleStyle}
      />
    </div>
    </div>
  );
}

export default memo(TrackNode);

