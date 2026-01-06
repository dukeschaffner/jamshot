'use client';

import { memo, useRef } from 'react';
import { Handle, Position } from 'reactflow';
import Image from 'next/image';
import { FaCheckCircle } from 'react-icons/fa';
import './TrackNode.module.css';

function TrackNode({ data }) {
  const { track, size, color, isSelected, onNodeClick, onNodeHover } = data;
  const nodeRef = useRef(null);

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
      className={`track-node ${isSelected ? 'selected' : ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: '50%',
        position: 'relative',
        cursor: 'pointer',
        border: isSelected ? '3px solid var(--seafoam)' : '2px solid var(--grey-3)',
        boxShadow: isSelected 
          ? '0 0 20px rgba(147, 233, 190, 0.5)' 
          : '0 2px 8px rgba(0, 0, 0, 0.15)',
        transition: 'all 0.2s ease',
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
      
      {/* Avatar overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '-5px',
          right: '-5px',
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: '50%',
          border: '2px solid var(--background)',
          overflow: 'hidden',
          backgroundColor: 'var(--grey-1)',
        }}
      >
        <Image
          src={track?.profile_pic_url || '/avatar.svg'}
          alt={track?.username || 'Artist'}
          width={size * 0.4}
          height={size * 0.4}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {track?.verified && (
          <div
            style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              color: 'var(--seafoam)',
              backgroundColor: 'var(--background)',
              borderRadius: '50%',
              width: size * 0.2,
              height: size * 0.2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FaCheckCircle size={size * 0.15} />
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ visibility: 'hidden' }}
      />
    </div>
  );
}

export default memo(TrackNode);

