import React from 'react';
import { ViewportPortal } from '@xyflow/react';
import { CONCENTRIC_CONFIG } from '../utils/config';

const { OUTER_RING_RADIUS } = CONCENTRIC_CONFIG;
 
export default function LoadNewTracksButton({ newTrackCount, onLoadNewTracks }) {

  if(newTrackCount <= 0) {
    return null;
  }

  const buttonText = newTrackCount === 1 
    ? 'Load 1 New Track' 
    : `Load ${newTrackCount} New Tracks`;

  return (
    <ViewportPortal>
      <div
        style={{ 
          pointerEvents: 'all',
            transform: `translateX(${OUTER_RING_RADIUS * 1.10}px) translateY(-${OUTER_RING_RADIUS * 1.10}px)`,
            position: 'absolute',
            backgroundColor: 'var(--grey-2)',
            boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.5)',
            color: 'var(--seafoam)',
            fontWeight: 'bold',
            fontSize: '16px',
            padding: '10px 20px',
            borderRadius: '5px',
            border: '1px solid var(--seafoam)',
            backgroundColor: 'var(--white)',
            boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.5)',
            zIndex: 100000,
            cursor: 'pointer',
        }}
        onClick={onLoadNewTracks}
      >
          {buttonText}
      </div>
    </ViewportPortal>
  );
}