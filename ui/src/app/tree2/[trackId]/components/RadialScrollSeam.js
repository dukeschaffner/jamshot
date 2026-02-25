import React from 'react';
import { ViewportPortal } from '@xyflow/react';
import { CONCENTRIC_CONFIG } from '../utils/config';

const { OUTER_RING_RADIUS } = CONCENTRIC_CONFIG;
 
export default function () {
  return (
    <ViewportPortal>
      <div
        style={{ 
            height: `${OUTER_RING_RADIUS * 1.3}px`, 
            transform: 'translateY(-100%)',
            width: '2px',
            position: 'absolute',
            backgroundColor: 'var(--grey-2)',
            boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.5)',
        }}
      />
    </ViewportPortal>
  );
}