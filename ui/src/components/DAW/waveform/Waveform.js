'use client';

import styles from './Waveform.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { bufferRegistry } from '../core/BufferRegistry';
import WaveformChunk from './WaveformChunk';
import { useDAW } from '../DAWContext';
import { eventBus } from '../EventBus';
import { DAW_EVENTS } from '../DAWEvents';

export default function Waveform({ 
  region,
  bufferKey,
  trackRef,
  track,
  tracksScrollContainerRef
}) {
  const containerRef = useRef(null);
  const [chunks, setChunks] = useState([]);
  const [visibleChunks, setVisibleChunks] = useState(new Set());
  const [buffer, setBuffer] = useState(null);
  const [bufferData, setBufferData] = useState(null);
  const MAX_CHUNK_WIDTH = 2000;

  const [width, setWidth] = useState(0); // width of the waveform/region in pixels
  const [trackRectWidth, setTrackRectWidth] = useState(0); // width of the track rect

  const [startTime, setStartTime] = useState(0); // start time of the waveform in the track
  const [endTime, setEndTime] = useState(0); // end time of the waveform in the track
  const [offset, setOffset] = useState(0); // start time relative to buffer start

  // Crop handles state
  const [showCropHandles, setShowCropHandles] = useState(false);
  const [isDraggingCropStart, setIsDraggingCropStart] = useState(false);
  const [isDraggingCropEnd, setIsDraggingCropEnd] = useState(false);
  const [cropStartPercentage, setCropStartPercentage] = useState(0);
  const [cropEndPercentage, setCropEndPercentage] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);

  const [cropStartOffset, setCropStartOffset] = useState(0);
  const [cropEndOffset, setCropEndOffset] = useState(0);

  // Region dragging state
  const [isDraggingRegion, setIsDraggingRegion] = useState(false);
  const [regionStartPosBeforeDrag, setRegionStartPosBeforeDrag] = useState(0);
  const [regionLeftPos, setRegionLeftPos] = useState(0); // position in pixels relative to track

  // Crop handle refs
  const cropStartOverlayRef = useRef(null);
  const cropEndOverlayRef = useRef(null);

  const { scrollLeft, duration, zoom, isPlaying, isRecording } = useDAW();

  // #region initial load

  // On initial load, load the buffer
  useEffect(() => {
    if (!bufferKey) return;
    
    const audioBuffer = bufferRegistry.getBuffer(bufferKey);
    if (!audioBuffer) return;
    
    setBuffer(audioBuffer);
    const numChannels = audioBuffer.numberOfChannels;
    const bufferData = Array.from({ length: numChannels }, (_, i) => audioBuffer.getChannelData(i));
    setBufferData(bufferData);
  }, [bufferKey]);

  // Listen to track rect width changes
  useEffect(() => {
    if (!trackRef?.current) return;

    const updateTrackRectWidth = () => {
      if (trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        setTrackRectWidth(rect.width);
      }
    };

    // Initial measurement
    updateTrackRectWidth();

    // Set up ResizeObserver to watch for width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTrackRectWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(trackRef.current);

    // Cleanup
    return () => {
      if (trackRef.current) {
        resizeObserver.unobserve(trackRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [trackRef]);

  // On initial load, Set the width of the waveform based on the region
  useEffect(() => {
    if (!track || !bufferKey || !duration || !trackRectWidth) return;
    const region = track.regions.find(r => r.key === bufferKey);
    if (region) {
      setStartTime(region.startTime);
      setEndTime(region.endTime);
      setOffset(region.offset);
      const regionWidth = (region.endTime - region.startTime) / duration * trackRectWidth;
      setWidth(regionWidth);
      
      // Set initial region position
      const regionLeftPos = region.startTime / duration * trackRectWidth;
      setRegionLeftPos(regionLeftPos);
    }
  }, [bufferKey, track, duration, trackRectWidth]);

  // #endregion

  // #region region dragging logic

  // Handle mouse down on region for dragging
  const handleRegionMouseDown = (e) => {
    e.stopPropagation();
    // Only allow dragging if not playing or recording
    if (isPlaying || isRecording) return;
    
    setIsDraggingRegion(true);
    setDragStartX(e.clientX);
    setRegionStartPosBeforeDrag(regionLeftPos);
  };

  // Mouse event handlers for region dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRegion) return;
      
      const deltaX = e.clientX - dragStartX;
      const newLeftPos = regionStartPosBeforeDrag + deltaX;
      
      // Get the tracks scroll container bounds
      const scrollContainerRect = tracksScrollContainerRef?.current?.getBoundingClientRect();
      if (!scrollContainerRect) return;
      
      // Ensure the region stays within bounds
      let boundedLeftPos = newLeftPos;
      
      // Don't allow dragging beyond the left edge of the scroll container
      if (boundedLeftPos < 0) {
        boundedLeftPos = 0;
      }
      
      // Don't allow dragging beyond the right edge of the scroll container
      const maxLeftPos = scrollContainerRect.width - width;
      if (boundedLeftPos > maxLeftPos) {
        boundedLeftPos = maxLeftPos;
      }
      
      setRegionLeftPos(boundedLeftPos);
    };
    
    const handleMouseUp = (e) => {
      e.stopPropagation();
      setIsDraggingRegion(false);
      
      // Update the region's start time based on new position
      if (track && bufferKey && duration && trackRectWidth) {
        const newStartTime = (regionLeftPos / trackRectWidth) * duration;
        const regionDuration = endTime - startTime;
        const newEndTime = newStartTime + regionDuration;
        
        // Update the region in the track
        const updatedRegion = {
          ...region,
          startTime: newStartTime,
          endTime: newEndTime
        };
        
        // Emit event to update the track manager
        eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
          region: updatedRegion,
          trackId: track.id
        });
        
        // Update local state
        setStartTime(newStartTime);
        setEndTime(newEndTime);
      }
    };
    
    if (isDraggingRegion) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRegion, dragStartX, regionStartPosBeforeDrag, regionLeftPos, width, track, bufferKey, duration, trackRectWidth, tracksScrollContainerRef, region, endTime, startTime]);

  // #endregion

  // #region crop logic

  // Handle mouse down on crop start handle
  const handleCropStartMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingCropStart(true);
    setDragStartX(e.clientX);
  };

  // Handle mouse down on crop end handle
  const handleCropEndMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingCropEnd(true);
    setDragStartX(e.clientX);
  };

  // Check if mouse is hovering near edges to show crop handles
  const handleWaveformMouseMove = (e) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const leftEdgeZone = rect.left + 15; // 15px from left edge
    const rightEdgeZone = rect.right - 15; // 15px from right edge
    
    // If mouse is close to either edge, show the crop handles
    const isNearEdge = e.clientX < leftEdgeZone || e.clientX > rightEdgeZone;
    setShowCropHandles(isNearEdge);
    
    // Update cursor based on position
    if (e.clientX < leftEdgeZone) {
      containerRef.current.style.cursor = 'col-resize';
    } else if (e.clientX > rightEdgeZone) {
      containerRef.current.style.cursor = 'col-resize';
    } else {
      containerRef.current.style.cursor = 'grab';
    }
  };

  const handleWaveformMouseLeave = () => {
    setShowCropHandles(false);
    if (containerRef.current) {
      containerRef.current.style.cursor = 'default';
    }
  };

  // Mouse event handlers for crop dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingCropStart && !isDraggingCropEnd) return;
      
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      // Handle crop start dragging
      if (isDraggingCropStart) {
        const cropEndX = cropEndOverlayRef.current?.getBoundingClientRect().left;
        const buffer = 5 * (rect.width / 100);
        let newCropX = 0;
        
        if (e.clientX < rect.left) {
          newCropX = rect.left;
        } else if (cropEndX && e.clientX > cropEndX - buffer) {
          newCropX = cropEndX - buffer;
        } else {
          newCropX = e.clientX;
        }

        const relativePos = (newCropX - rect.left) / rect.width * 100;
        setCropStartPercentage(relativePos);
      }
      
      // Handle crop end dragging
      if (isDraggingCropEnd) {
        const cropStartX = cropStartOverlayRef.current?.getBoundingClientRect().right;
        const buffer = 5 * (rect.width / 100);
        let newCropX = 0;
        
        if (e.clientX > rect.right) {
          newCropX = rect.right;
        } else if (cropStartX && e.clientX < cropStartX + buffer) {
          newCropX = cropStartX + buffer;
        } else {
          newCropX = e.clientX;
        }

        const relativePos = (rect.right - newCropX) / rect.width * 100;
        setCropEndPercentage(relativePos);
      }
    };
    
    const handleMouseUp = (e) => {
      e.stopPropagation();
      setIsDraggingCropStart(false);
      setIsDraggingCropEnd(false);
    };
    
    if (isDraggingCropStart || isDraggingCropEnd) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingCropStart, isDraggingCropEnd]);

  // #endregion

// #region render functions

  // Generate chunks based on peaks
  useEffect(() => {
    if (!buffer) return;
    
    const baseChunkWidth = Math.min(MAX_CHUNK_WIDTH, width);
    const chunksCount = Math.ceil(width / baseChunkWidth);
    const newChunks = [];
    
    for (let i = 0; i < chunksCount; i++) {
      const startPixel = i * baseChunkWidth;
      const endPixel = Math.min(startPixel + baseChunkWidth, width);
      const chunkWidth = endPixel - startPixel;

      newChunks.push({
        id: i,
        width: chunkWidth,
        offset: startPixel
      });
    }
    
    setChunks(newChunks);
  }, [buffer, width]);

  // Cleanup offscreen canvases when chunks become invisible
  useEffect(() => {
    const cleanup = () => {
      chunks.forEach(chunk => {
        if (!visibleChunks.has(chunk.id)) {
          // Trigger cleanup in WaveformChunk component
          // This will be handled by the component's useEffect
        }
      });
    };
    
    cleanup();
  }, [visibleChunks, chunks]);

  // #endregion

  if (!buffer || !chunks) {
    return (
      <div className={styles.waveformContainer} style={{ width: `${width}%`, height: '100%' }}>
        <div className={styles.loading}>Loading waveform...</div>
      </div>
    );
  }

  return (
    <div 
      className={`${styles.region} ${isDraggingCropStart || isDraggingCropEnd ? styles.cropping : ''} ${isDraggingRegion ? styles.dragging : ''}`} 
      style={{ 
        width: `${width}px`, 
        height: '100%',
        left: `${regionLeftPos}px`,
        cursor: isPlaying || isRecording ? 'default' : (isDraggingRegion ? 'grabbing' : 'grab')
      }}
      ref={containerRef}
      onMouseDown={handleRegionMouseDown}
      onMouseMove={handleWaveformMouseMove}
      onMouseLeave={handleWaveformMouseLeave}
    >
      <div 
        className={`${styles.waveformContainer}`}
        style={{ width: `${width}px`, height: '100%' }}
      >
        <div 
          className={styles.waveformContent}
          style={{ 
            width: '100%',
            height: '100%',
            position: 'relative'
          }}
        >
          {chunks.map(chunk => (
            <WaveformChunk
              key={chunk.id}
              bufferData={bufferData}
              height={100}
              totalWidth={width}
              width={chunk.width}
              offset={chunk.offset}
              scrollLeft={scrollLeft}
            />
          ))}
          
 
        </div>
      </div>
               {/* Crop handles */}
            {showCropHandles && (
            <>
              <div 
                className={`${styles.cropHandle} ${styles.cropHandleLeft}`}
                onMouseDown={handleCropStartMouseDown}
                title="Drag to crop start"
              />
              <div 
                className={`${styles.cropHandle} ${styles.cropHandleRight}`}
                onMouseDown={handleCropEndMouseDown}
                title="Drag to crop end"
              />
            </>
          )}
          
          {/* Crop overlays */}
          {(isDraggingCropStart || isDraggingCropEnd) && (
            <>
              <div 
                className={styles.cropLeftOverlay}
                ref={cropStartOverlayRef}
                style={{ width: `${cropStartPercentage}%` }}
              />
              <div 
                className={styles.cropRightOverlay}
                ref={cropEndOverlayRef}
                style={{ width: `${cropEndPercentage}%` }}
              />
            </>
          )}
    </div>
  );
} 