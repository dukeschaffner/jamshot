'use client';

import { memo, useRef, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import Image from 'next/image';
import { FaCheckCircle } from 'react-icons/fa';
import styles from '../TreeView.module.css';
import { CONCENTRIC_CONFIG } from '../utils/config';
import {BASE_NODE_SIZE} from '../utils/config';
import { getInstrumentIcon, getFirstInstrument, getAdditionalInstrumentCount } from '../utils/instrumentIcons';
import { useLoopListening } from '../utils/LoopListeningContext';
import PlayingIndicator from '../../../../components/PlayingIndicator';
import { useTreeInteractions } from '../utils/TreeInteractionsContext';

const { BASE_RING_SIZE, RING_SPACING } = CONCENTRIC_CONFIG;


function isNonvisibleDescendantPlaying(nodeTrackId, type, trackPath, expandedTrackIds) {
  if(type !== 'inner') {
    return false;
  }
  const currentTrackId = trackPath[trackPath.length - 1];
  if(!currentTrackId) {
    return false;
  }
  if(expandedTrackIds.includes(currentTrackId)) {
    return false;
  }
  const currentPlayingTrackParentId = trackPath[trackPath.length - 2];
  if(!currentPlayingTrackParentId) {
    return false;
  }
  const lastExpandedTrackId = expandedTrackIds[expandedTrackIds.length - 1];
  if(lastExpandedTrackId === currentPlayingTrackParentId || lastExpandedTrackId === nodeTrackId) {
    return false;
  }
  let deepestCommonAncestor = trackPath[0];
  for(let i = 1; i < trackPath.length; i++) {
    if(expandedTrackIds.includes(trackPath[i])) {
      deepestCommonAncestor = trackPath[i];
    }
    else {
      break;
    }
  }
  return deepestCommonAncestor === nodeTrackId;
}

function ConcentricNode({ data }) {
  let { track, isSelected, onNodeClick, onNodeHover, ringNumber, size = null, type = 'inner', angle, canScroll = false, playedTracks = new Set(), expandedTrackIds = [] } = data;
  const { trackPath, isPlaying, currentTrack } = useLoopListening();

  const { navigateToPlayingTrack } = useTreeInteractions();

  const nodeRef = useRef(null);

  // Check if this outer node is the currently playing track
  const isCurrentlyPlaying = type === 'outer' && track?.id === currentTrack?.id && isPlaying;
  
  // Check if this inner node is the currently playing track
  const isInnerCurrentlyPlaying = type === 'inner' && track?.id === currentTrack?.id && isPlaying;
  
  // Check if this track has been played
  const isPlayed = track?.id && playedTracks.has(track.id);

  const hasNonvisibleDescendantPlaying = isNonvisibleDescendantPlaying(track?.id, type, trackPath, expandedTrackIds) && isPlaying;

  const handlePlayingIndicatorClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    navigateToPlayingTrack();
  };


  // Calculate opacity for outer nodes based on angle (fade near top of circle)
  // Only apply fading if scrolling is possible
  let opacity = 1;
  if (type === 'outer' && angle !== undefined && canScroll) {
    // Top of circle is at 3π/2 (or -π/2) in standard polar coordinates
    const topAngle = 3 * Math.PI / 2;
    // Calculate distance from top, handling wrap-around
    let angleFromTop = Math.abs(angle - topAngle);
    // Handle wrap-around (if angle is near 0 or 2π, check distance via the other direction)
    if (angleFromTop > Math.PI) {
      angleFromTop = 2 * Math.PI - angleFromTop;
    }
    
    // Start fading at ±30 degrees from top, fully transparent at ±5 degrees
    const fadeStart = 30 * (Math.PI / 180); // 0.3491 radians
    const fadeEnd = 5 * (Math.PI / 180); // 0.0873 radians
    if (angleFromTop <= fadeStart) {
      if (angleFromTop <= fadeEnd) {
        // Fully transparent at ±5° and closer
        opacity = 0;
      } else {
        // Linear fade from full opacity at ±30° to transparent at ±5°
        opacity = (angleFromTop - fadeEnd) / (fadeStart - fadeEnd);
      }
    }
  }
  
  let playedOverlayOpacity = 0;
  if (isPlayed) {
    if (type === 'inner') {
      playedOverlayOpacity = 0.3;
    } 
    else if (type === 'outer') {
      playedOverlayOpacity = 0.5;
    }
  }


  const baseSize = BASE_NODE_SIZE;
  if(size){

  }
  else if(type === 'inner') {
    size = BASE_RING_SIZE + ringNumber * RING_SPACING;
  }
  else if(type === 'outer') {
    size = BASE_NODE_SIZE;
  }

  // const baseSize = BASE_RING_SIZE;
  const ringSizeFactor = size / baseSize;

  const radialHandleStyle = {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 1,
    height: 1,
    background: 'transparent',
    border: 'none',
  };


  // const color = track ? getTrackColor(track) : 'var(--grey-2)'; // Color based on popularity and plays
  const color = 'var(--seafoam)';
  const gradientBackground = type === 'inner' 
    ? 'linear-gradient(120deg, var(--seafoam), var(--rustic-pink))'
    : color;

  // Get instrument information for non-inner nodes
  const firstInstrument = type !== 'inner' ? getFirstInstrument(track) : null;
  const additionalCount = type !== 'inner' ? getAdditionalInstrumentCount(track) : 0;
  const InstrumentIcon = firstInstrument ? getInstrumentIcon(firstInstrument.name) : null;

  // Get all instruments for inner nodes
  const allInstruments = type === 'inner' && track?.instruments && Array.isArray(track.instruments) 
    ? track.instruments 
    : [];

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
      borderRadius: '50%',
      opacity: opacity,
    }}
    >
    {/* Pulsing/rotating gradient circle for currently playing outer node */}
    {isCurrentlyPlaying && (
      <div
        className={styles.playingGradientCircle}
        style={{
          position: 'absolute',
          width: `${baseSize * ringSizeFactor * 1.15}px`,
          height: `${baseSize * ringSizeFactor * 1.15}px`,
          borderRadius: '50%',
          background: 'linear-gradient(120deg, var(--seafoam), var(--rustic-pink))',
          zIndex: -1,
          transform: 'translate(-50%, -50%)',
          top: '50%',
          left: '50%',
        }}
      />
    )}
    <div
      className={`track-node ${isSelected ? 'selected' : ''} ${isInnerCurrentlyPlaying ? styles.innerPlaying : ''}`}
      style={{
        width: baseSize,
        height: baseSize,
        transform: isInnerCurrentlyPlaying ? undefined : `scale(${ringSizeFactor})`,
        transformOrigin: 'center center',
        flexShrink: 0,
        background: gradientBackground,
        borderRadius: '50%',
        position: 'relative',
        cursor: 'pointer',
        // border: isSelected ? `3px solid var(--seafoam)` : `2px solid var(--grey-3)`,
        boxShadow: isSelected 
          ? '0 0 20px rgba(147, 233, 190, 0.5)' 
          : '0 2px 8px rgba(0, 0, 0, 0.15)',
        transition: 'all 0.2s ease',
        '--base-scale': `${ringSizeFactor}`,
      }}

    >
        <div
          className={styles.playedOverlay}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: 'var(--grey-1)',
            opacity: playedOverlayOpacity,
            zIndex: 1,
          }}
        />
      <Handle
        type="target"
        position={Position.Top}
        style={radialHandleStyle}
      />
      
      {/* Avatar overlay */}
      {type !== 'inner' && (
        <>
      <div
        style={{
          position: 'absolute',
          // bottom: '-5px',
          // right: '-5px',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '2px solid var(--background)',
          overflow: 'hidden',
          backgroundColor: 'var(--grey-1)',
        }}
      >
        <Image
          src={track?.profile_pic_url || '/avatar.svg'}
          alt={track?.username || 'Artist'}
          width={100}
          height={100}
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
            width: '25px',
            height: '25px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FaCheckCircle size={20} />
        </div>
      )}
      {/* Instrument tag icon */}
      {InstrumentIcon && (
        <>
        <div
          style={{
            position: 'absolute',
            bottom: '-7px',
            left: '-7px',
            color: 'var(--text-primary)',
            backgroundColor: 'var(--background)',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--grey-3)',
            fontSize: '10px',
            zIndex: 1000,
          }}
        >
          <InstrumentIcon size={20} />
         
        </div>
        {additionalCount > 0 && (
            <div
            style={{
              position: 'absolute',
              bottom: '-7px',
              left: '-2px',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--grey-2)',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--grey-3)',
              fontSize: '10px',
              zIndex: 999,
            }}
          />
          )}
        </>
      )}
      
      </>
      )}

      

      <Handle
        type="source"
        position={Position.Bottom}
        style={radialHandleStyle}
      />
    </div>
    {/* Avatar overlay */}
    {type === 'inner' && (
      <div
      style={{
        position: 'absolute',
        // bottom: '-5px',
        right: '0px',
        // transform: 'scale(0.8)',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '2px solid var(--background)',
          overflow: 'hidden',
          backgroundColor: 'var(--grey-1)',
        }}
      >
        <Image
          src={track?.profile_pic_url || '/avatar.svg'}
          alt={track?.username || 'Artist'}
          width={100}
          height={100}
          style={{
            width: '50px',
            height: '50px',
            objectFit: 'cover',
          }}
        />
      </div>
      {track?.verified && (
        <div
          style={{
            position: 'absolute',
            bottom: '-4px',
            right: '-4px',
            color: 'var(--seafoam)',
            backgroundColor: 'var(--background)',
            borderRadius: '50%',
            width: '25px',
            height: '25px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FaCheckCircle size={20} />
        </div>
      )}
      </div>
      )}
        {/* Playing indicator for inner nodes */}
        {hasNonvisibleDescendantPlaying && (
        <div
          style={{
            position: 'absolute',
            top: '0px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
          onClick={handlePlayingIndicatorClick}
        >
          <PlayingIndicator size={30} color="black" title="Go to playing track" />
        </div>
      )}
      {/* Instrument tags for inner nodes - positioned along bottom inner edge */}
      {type === 'inner' && allInstruments.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: `${(size - baseSize * ringSizeFactor) / 2 + 4}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            flexWrap: 'wrap',
            // width: `${baseSize * ringSizeFactor * 0.9}px`,
            zIndex: 1000,
          }}
        >
          {allInstruments.map((instrument, index) => {
            const instrumentName = typeof instrument === 'string' ? instrument : instrument.name;
            const InstrumentIconComponent = getInstrumentIcon(instrumentName);
            return (
              <div
                key={instrument.id || index}
                style={{
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--background)',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--grey-3)',
                  fontSize: '10px',
                  zIndex: 1000,
                  flexShrink: 0,
                }}
                title={instrumentName}
              >
                <InstrumentIconComponent size={20} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(ConcentricNode);

