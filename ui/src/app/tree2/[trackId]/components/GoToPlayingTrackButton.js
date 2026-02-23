import React from 'react';
import { ViewportPortal } from '@xyflow/react';
import { CONCENTRIC_CONFIG } from '../utils/config';
import PlayingIndicator from '../../../../components/PlayingIndicator';
import { useTreeInteractions } from '../utils/TreeInteractionsContext';

const { OUTER_RING_RADIUS } = CONCENTRIC_CONFIG;
 
export default function GoToPlayingTrackButton() {
  const { navigateToPlayingTrack } = useTreeInteractions();


  return (
    <ViewportPortal>
      <div
        style={{ 
          pointerEvents: 'all',
            transform: `translateX(-50%) translateY(${OUTER_RING_RADIUS * 1.60}px)`,
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
        onClick={navigateToPlayingTrack}
      >
          Go to Playing Track
          <PlayingIndicator size={20} />
      </div>
    </ViewportPortal>
  );
}