'use client';

import styles from './Region.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { bufferRegistry } from '../core/BufferRegistry';
import WaveformChunk from './waveform/WaveformChunk';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import DAWConfig from '../misc/DAWConfig';
import { snapToGrid } from '../misc/DAWUtils';

export default function Region({ 
  region,
  bufferKey,
  trackRef,
  track,
  tracksScrollContainerRef,
  readonly = false
}) {
  const { scrollLeft, duration, zoom, isPlaying, isRecording, tracksContainerWidth, gridLines } = useDAW();


  const musicGridLinesRef = useRef([]);
  const regionContainerRef = useRef(null);
  const waveformContainerRef = useRef(null);
  const [chunks, setChunks] = useState([]);
  const [visibleChunks, setVisibleChunks] = useState(new Set());
  const [buffer, setBuffer] = useState(null);
  const [bufferData, setBufferData] = useState(null);
  const MAX_CHUNK_WIDTH = 2000;

  const [width, setWidth] = useState(0); // width of the waveform/region in percentage
  const widthPx = width * tracksContainerWidth / 100; // width of the waveform/region in pixels
  const [waveformWidth, setWaveformWidth] = useState(0); // width of the waveform in pixels

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

  // Crop handle refs
  const cropStartOverlayRef = useRef(null);
  const cropEndOverlayRef = useRef(null);

  const [regionLeftPos, setRegionLeftPos] = useState(0); // position in percentage relative to track
  const [regionCropLeftPos, setRegionCropLeftPos] = useState(0); // when cropping, position of the region in percentage relative to the track
  const [regionCropWidth, setRegionCropWidth] = useState(0); // when cropping, width of the region in percentage relative to the track
  const [waveformLeftPos, setWaveformLeftPos] = useState(0); // position of the waveform in percentage relative to the region
  const [waveformLeftCropPos, setWaveformLeftCropPos] = useState(0); // when cropping, position of the waveform in percentage relative to the region

  // Region dragging state
  const [isDraggingRegion, setIsDraggingRegion] = useState(false);
  const [regionStartPosBeforeDrag, setRegionStartPosBeforeDrag] = useState(0);

  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  // Grid snapping state
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const tracksContainerWidthRef = useRef(0);

  const [shouldRender, setShouldRender] = useState(true); // whether to render the region



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

  // On initial load, Set the width of the waveform based on the region
  useEffect(() => {
    if (!track || !bufferKey || !duration) return;
    const region = track.regions.find(r => r.key === bufferKey);
    if (region) {
      let regionShouldRender = true;
      if(region.startTime > duration) { // Don't render the region if it's outside the duration
        regionShouldRender = false;
      }
      else if(region.endTime > duration) { // If project end cuts off the region, set the end time to the project end
        region.endTime = duration;
        eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region: region, trackId: track.id });
      }
      setShouldRender(regionShouldRender);
      setStartTime(region.startTime);
      setEndTime(region.endTime);
      setOffset(region.offset);
      const regionWidth = (region.endTime - region.startTime) / duration;
      setWidth(regionWidth);
      
      // Set initial region position
      const regionLeftPos = region.startTime / duration * 100;
      setRegionLeftPos(regionLeftPos);
    }
  }, [bufferKey, track, duration]);


  useEffect(() => {
    musicGridLinesRef.current = gridLines;
  }, [gridLines]);

  // Event listeners for grid updates
  useEffect(() => {
    const handleSnapToGridChange = (data) => {
      setSnapToGridEnabled(data.snapToGridEnabled);
    };

    // Listen for grid snap toggle events
    eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.SNAP_TO_GRID_CHANGE, handleSnapToGridChange);

    return () => {
      eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.SNAP_TO_GRID_CHANGE, handleSnapToGridChange);
    };
  }, []);

  useEffect(() => {
    tracksContainerWidthRef.current = tracksContainerWidth;
  }, [tracksContainerWidth]);


  useEffect(() => {
    if (!buffer || !tracksContainerWidth || !duration) return;
    const waveformWidthPx = buffer.duration * tracksContainerWidth / duration;
    setWaveformWidth(waveformWidthPx);
  }, [buffer, tracksContainerWidth, duration, width]);

  // #endregion

  // #region region dragging logic

  // Handle mouse down on region for dragging
  const handleRegionMouseDown = (e) => {
    e.stopPropagation();
    // Only allow dragging if not playing or recording
    if (isRecording) return;
    
    setIsDraggingRegion(true);
    setDragStartX(e.clientX);
    const regionLeftPixels = regionLeftPos * tracksContainerWidth / 100;
    setRegionStartPosBeforeDrag(regionLeftPixels);
  };

  // Handle right-click for context menu
  const handleRegionContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isRecording || readonly) return;
    
    // Position context menu at mouse position
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Handle region deletion
  const handleRegionDelete = () => {
    if (isRecording || readonly) return;

    if (track && region) {
      eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
        region: region,
        trackId: track.id
      });
    }

    // Hide context menu
    setShowContextMenu(false);
  };

  // Check for overlaps with other regions and handle them
  const handleRegionOverlaps = (draggedRegion, newStartTime, newEndTime) => {
    if (!track || !track.regions) return;

    const otherRegions = track.regions.filter(r => r.id !== draggedRegion.id && r.active);

    otherRegions.forEach(otherRegion => {
      // Check if there's any overlap
      if (newStartTime < otherRegion.endTime && newEndTime > otherRegion.startTime) {
        console.log('overlap detected - checking for complete overlap');
        // Check if this is a complete overlap (dragged region eclipses the other region)
        if (newStartTime <= otherRegion.startTime && newEndTime >= otherRegion.endTime) {
          // Complete overlap - mark the other region as inactive
          const updatedRegion = {
            ...otherRegion,
            active: false
          };
          console.log('complete overlap - marking other region as inactive', updatedRegion);
          eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
            region: updatedRegion,
            trackId: track.id
          });
        } else {
          // Check if dragged region is completely contained within the other region
          if (newStartTime > otherRegion.startTime && newEndTime < otherRegion.endTime) {

            // Split the other region into two parts

            // Create first region (before the dragged region)
            const firstRegion = {
              ...otherRegion,
              startTime: otherRegion.startTime,
              endTime: newStartTime,
              offset: otherRegion.offset,
              active: true
            };

            // Create second region (after the dragged region)
            const secondRegion = {
              ...otherRegion,
              id: 'track-' + track.id + '-' + Math.random().toString(36).substring(2, 15),
              startTime: newEndTime,
              endTime: otherRegion.endTime,
              offset: otherRegion.offset + (newEndTime - otherRegion.startTime),
              active: true
            };

            // Add the two new regions
            eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
              region: firstRegion,
              trackId: track.id
            });
            eventBus.emit(DAW_EVENTS.REGION.ADD, {
              region: secondRegion,
              trackId: track.id
            });
          } else {
            // Partial overlap - adjust the overlapped region
            let updatedRegion = { ...otherRegion };

            // Calculate overlap details
            const overlapStart = Math.max(newStartTime, otherRegion.startTime);
            const overlapEnd = Math.min(newEndTime, otherRegion.endTime);

            // Check if the overlap affects the start or end of the other region
            const affectsStart = overlapStart === otherRegion.startTime;
            const affectsEnd = overlapEnd === otherRegion.endTime;

            if (affectsStart && !affectsEnd) {
              // Overlap affects only the start - trim from start
              const timeCut = overlapEnd - overlapStart;
              console.log('overlap affects only the start - trimming from start', timeCut);
              updatedRegion.startTime = otherRegion.startTime + timeCut;
              updatedRegion.offset = otherRegion.offset + timeCut;
            } else if (affectsEnd && !affectsStart) {
              // Overlap affects only the end - trim from end
              const timeCut = overlapEnd - overlapStart;
              console.log('overlap affects only the end - trimming from end', timeCut);
              updatedRegion.endTime = otherRegion.endTime - timeCut;
            }

            // Only update if there are actual changes and the region still has positive duration
            if ((updatedRegion.startTime !== otherRegion.startTime ||
                 updatedRegion.endTime !== otherRegion.endTime ||
                 updatedRegion.offset !== otherRegion.offset ||
                 updatedRegion.active !== otherRegion.active) &&
                (updatedRegion.active === false || updatedRegion.endTime > updatedRegion.startTime)) {

              eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
                region: updatedRegion,
                trackId: track.id
              });
            }
          }
        }
      }
    });
  };

  // Handle click outside context menu to close it
  useEffect(() => {
    const handleClickOutside = () => {
      setShowContextMenu(false);
    };
    
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showContextMenu]);

  // Mouse event handlers for region dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRegion) return;
      const deltaX = e.clientX - dragStartX;
      const newLeftPos = regionStartPosBeforeDrag + deltaX;
      
      // Get the tracks scroll container bounds
      const trackRect = trackRef?.current?.getBoundingClientRect();
      if (!trackRect) return;
      
      // Ensure the region stays within bounds
      let boundedLeftPos = newLeftPos;
      
      // Don't allow dragging beyond the left edge of the scroll container
      if (boundedLeftPos < 0) {
        boundedLeftPos = 0;
      }
      
      // Don't allow dragging beyond the right edge of the scroll container
      const maxLeftPos = trackRect.width - widthPx;
      if (boundedLeftPos > maxLeftPos) {
        boundedLeftPos = maxLeftPos;
      }
      
      const newRegionLeftPos = boundedLeftPos / tracksContainerWidth * 100;
      const snappedRegionLeftPos = snapToGrid(newRegionLeftPos, snapToGridEnabled, duration, musicGridLinesRef.current, tracksContainerWidthRef.current, DAWConfig.ui.gridSnapThreshold);
      setRegionLeftPos(snappedRegionLeftPos);
    };
    
    const handleMouseUp = (e) => {
      e.stopPropagation();
      setIsDraggingRegion(false);

      // Update the region's start time based on new position
      if (track && bufferKey && duration && tracksContainerWidth) {
        // Use the snapped position for calculating the new start time
        const snappedRegionLeftPos = snapToGrid(regionLeftPos, snapToGridEnabled, duration, musicGridLinesRef.current, tracksContainerWidthRef.current, DAWConfig.ui.gridSnapThreshold);
        const newStartTime = (snappedRegionLeftPos / 100) * duration;
        const regionDuration = endTime - startTime;
        const newEndTime = newStartTime + regionDuration;

        // Check for overlaps with other regions and handle them
        handleRegionOverlaps(region, newStartTime, newEndTime);

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
  }, [isDraggingRegion, dragStartX, regionStartPosBeforeDrag, regionLeftPos, widthPx, track, bufferKey, duration, tracksContainerWidth, tracksScrollContainerRef, region, endTime, startTime]);

  // #endregion

  // #region crop logic

  // Update crop pos values
  useEffect(() => {
    if (!buffer || !duration) return;
    const newRegionLeftPos = startTime / duration * 100;
    setRegionLeftPos(newRegionLeftPos); // %
    const newDuration = endTime - startTime;
    setWidth(newDuration / duration * 100); // %

    let newRegionCropLeftTime = startTime - offset;
    if (newRegionCropLeftTime < 0) {
      newRegionCropLeftTime = 0;
    }
    setRegionCropLeftPos(newRegionCropLeftTime / duration * 100); // %

    const newRegionCropEndTime = Math.min(startTime + buffer.duration - offset, duration);
    const newRegionCropDuration = newRegionCropEndTime - newRegionCropLeftTime;
    const newRegionCropWidth = newRegionCropDuration / duration * 100;
    setRegionCropWidth(newRegionCropWidth); // %

    const newWaveformLeftPos = - (offset / newDuration) * 100;
    setWaveformLeftPos(newWaveformLeftPos); // %

    const newWaveformCropTimeOffset = offset - (startTime - newRegionCropLeftTime); // time offset of the waveform relative to the region cropping start
    const newWaveformCropLeftPos = - (newWaveformCropTimeOffset / newRegionCropDuration) * 100;
    setWaveformLeftCropPos(newWaveformCropLeftPos); // %

    let newCropStartPercentage = (startTime - newRegionCropLeftTime) / newRegionCropDuration * 100;
    let newCropEndPercentage = (newRegionCropEndTime - endTime) / newRegionCropDuration * 100;
    setCropStartPercentage(newCropStartPercentage);
    setCropEndPercentage(newCropEndPercentage);
  }, [buffer, duration, startTime, endTime, offset]);

  // Handle mouse down on crop start handle
  const handleCropStartMouseDown = (e) => {
    if (readonly) return;
    e.stopPropagation();
    setIsDraggingCropStart(true);
    setDragStartX(e.clientX);
  };

  // Handle mouse down on crop end handle
  const handleCropEndMouseDown = (e) => {
    if (readonly) return;
    e.stopPropagation();
    setIsDraggingCropEnd(true);
    setDragStartX(e.clientX);
  };

  // Check if mouse is hovering near edges to show crop handles
  const handleWaveformMouseMove = (e) => {
    if (!regionContainerRef.current || readonly) return;
    
    const rect = regionContainerRef.current.getBoundingClientRect();
    const leftEdgeZone = rect.left + 15; // 15px from left edge
    const rightEdgeZone = rect.right - 15; // 15px from right edge
    
    // If mouse is close to either edge, show the crop handles
    const isNearEdge = e.clientX < leftEdgeZone || e.clientX > rightEdgeZone;
    setShowCropHandles(isNearEdge);
    
    // Update cursor based on position
    if (e.clientX < leftEdgeZone) {
      regionContainerRef.current.style.cursor = 'col-resize';
    } else if (e.clientX > rightEdgeZone) {
      regionContainerRef.current.style.cursor = 'col-resize';
    } else {
      regionContainerRef.current.style.cursor = 'grab';
    }
  };

  const handleWaveformMouseLeave = () => {
    setShowCropHandles(false);
    if (regionContainerRef.current) {
      regionContainerRef.current.style.cursor = 'default';
    }
  };

  // Mouse event handlers for crop dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingCropStart && !isDraggingCropEnd) return;
      
      const trackRect = trackRef?.current?.getBoundingClientRect();
      if (!trackRect) return;
      
      const regionRect = regionContainerRef.current?.getBoundingClientRect();
      if (!regionRect) return;
      
      // Handle crop start dragging
      if (isDraggingCropStart) {
        const cropEndX = cropEndOverlayRef.current?.getBoundingClientRect().left;
        const cropBuffer = 5 * (regionRect.width / 100);
        let newCropX = 0;

        if (e.clientX < regionRect.left || e.clientX < trackRect.left) {
          newCropX = Math.max(regionRect.left, trackRect.left);
        } else if (cropEndX && e.clientX > cropEndX - cropBuffer) {
          newCropX = cropEndX - cropBuffer;
        } else {
          newCropX = e.clientX;
        }

        const relativePos = (newCropX - regionRect.left) / regionRect.width * 100;

        // Apply grid snapping to crop start position
        const regionCropDuration = regionCropWidth / 100 * duration;
        const regionCropLeftTime = regionCropLeftPos / 100 * duration;
        const proposedCropStartTime = regionCropLeftTime + (relativePos / 100) * regionCropDuration;
        const proposedTrackPercentage = (proposedCropStartTime / duration) * 100;
        const snappedTrackPercentage = snapToGrid(proposedTrackPercentage, snapToGridEnabled, duration, musicGridLinesRef.current, tracksContainerWidthRef.current, DAWConfig.ui.gridSnapThreshold);
        const snappedCropStartTime = (snappedTrackPercentage / 100) * duration;

        // Convert back to relative position within crop area
        const snappedRelativePos = ((snappedCropStartTime - regionCropLeftTime) / regionCropDuration) * 100;
        const clampedRelativePos = Math.max(0, Math.min(100, snappedRelativePos));

        setCropStartPercentage(clampedRelativePos);
      }
      
      // Handle crop end dragging
      if (isDraggingCropEnd) {
        const cropStartX = cropStartOverlayRef.current?.getBoundingClientRect().right;
        const buffer = 5 * (regionRect.width / 100);
        let newCropX = 0;

        if (e.clientX > regionRect.right) {
          newCropX = regionRect.right;
        } else if (cropStartX && e.clientX < cropStartX + buffer) {
          newCropX = cropStartX + buffer;
        } else {
          newCropX = e.clientX;
        }

        const relativePos = (regionRect.right - newCropX) / regionRect.width * 100;

        // Apply grid snapping to crop end position
        const regionCropDuration = regionCropWidth / 100 * duration;
        const regionCropLeftTime = regionCropLeftPos / 100 * duration;
        const proposedCropEndTime = regionCropLeftTime + regionCropDuration - (relativePos / 100) * regionCropDuration;
        const proposedTrackPercentage = (proposedCropEndTime / duration) * 100;
        const snappedTrackPercentage = snapToGrid(proposedTrackPercentage, snapToGridEnabled, duration, musicGridLinesRef.current, tracksContainerWidthRef.current, DAWConfig.ui.gridSnapThreshold);
        const snappedCropEndTime = (snappedTrackPercentage / 100) * duration;

        // Convert back to relative position within crop area
        const snappedRelativePos = ((regionCropLeftTime + regionCropDuration - snappedCropEndTime) / regionCropDuration) * 100;
        const clampedRelativePos = Math.max(0, Math.min(100, snappedRelativePos));

        setCropEndPercentage(clampedRelativePos);
      }
    };
    
    const handleMouseUp = (e) => {
      e.stopPropagation();

      // Update the region based on crop changes
      if (track && bufferKey && duration) {
        const regionCropDuration = regionCropWidth / 100 * duration;
        const regionCropLeftTime = regionCropLeftPos / 100 * duration; // reference time. Then get time delta from this time to crop start or end percentage
        
        let newStartTime = startTime;
        let newEndTime = endTime;
        let newOffset = offset;
        
        // If cropping from start, update start time and offset
        if (isDraggingCropStart && cropStartPercentage >= 0) {
          const cropTime = (cropStartPercentage / 100) * regionCropDuration;
          newStartTime = regionCropLeftTime + cropTime;
          // Snap the new start time to grid
          const newStartTimePercentage = (newStartTime / duration) * 100;
          const snappedStartPercentage = snapToGrid(newStartTimePercentage, snapToGridEnabled, duration, musicGridLinesRef.current, tracksContainerWidthRef.current, DAWConfig.ui.gridSnapThreshold);
          newStartTime = (snappedStartPercentage / 100) * duration;
          newOffset = offset + newStartTime - startTime;
        }

        // If cropping from end, update end time
        if (isDraggingCropEnd && cropEndPercentage >= 0) {
          const cropTime = (cropEndPercentage / 100) * regionCropDuration;
          newEndTime = regionCropLeftTime + regionCropDuration - cropTime;
          // Snap the new end time to grid
          const newEndTimePercentage = (newEndTime / duration) * 100;
          const snappedEndPercentage = snapToGrid(newEndTimePercentage, snapToGridEnabled, duration, musicGridLinesRef.current, tracksContainerWidthRef.current, DAWConfig.ui.gridSnapThreshold);
          newEndTime = (snappedEndPercentage / 100) * duration;
        }
        
        
        // Update the region in the track 
        const updatedRegion = {
          ...region,
          startTime: newStartTime,
          endTime: newEndTime,
          offset: newOffset
        };
        
        // Emit event to update the track manager
        eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
          region: updatedRegion,
          trackId: track.id
        });
        
        // Update local state
        setStartTime(newStartTime);
        setEndTime(newEndTime);
        setOffset(newOffset);
      }

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
  }, [isDraggingCropStart, isDraggingCropEnd, track, bufferKey, duration, startTime, endTime, offset, cropStartPercentage, cropEndPercentage, buffer, region, regionCropLeftPos, regionCropWidth]);

  // #endregion

// #region render functions

  // Generate chunks based on peaks
  useEffect(() => {
    if (!buffer || !waveformWidth) return;
    const baseChunkWidth = Math.min(MAX_CHUNK_WIDTH, waveformWidth);
    const chunksCount = Math.ceil(waveformWidth / baseChunkWidth);
    const newChunks = [];
    
    for (let i = 0; i < chunksCount; i++) {
      const startPixel = i * baseChunkWidth;
      const endPixel = Math.min(startPixel + baseChunkWidth, waveformWidth);
      const chunkWidth = endPixel - startPixel;

      newChunks.push({
        id: i,
        width: chunkWidth,
        offset: startPixel
      });
    }
    
    setChunks(newChunks);
  }, [buffer, waveformWidth]);

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

  if (!shouldRender) {
    return null;
  }

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
        width: `${isDraggingCropStart || isDraggingCropEnd ? regionCropWidth : width}%`, 
        height: '100%',
        left: `${isDraggingCropStart || isDraggingCropEnd ? regionCropLeftPos : regionLeftPos}%`,
        cursor: isRecording ? 'default' : (isDraggingRegion ? 'grabbing' : 'grab')
      }}
      ref={regionContainerRef}
      onMouseDown={handleRegionMouseDown}
      onMouseMove={handleWaveformMouseMove}
      onMouseLeave={handleWaveformMouseLeave}
      onContextMenu={handleRegionContextMenu}
    >
      <div 
        className={`${styles.waveformContainer}`}
        ref={waveformContainerRef}
        style={{ 
          width: `${waveformWidth}px`, 
          height: '100%',
          left: `${isDraggingCropStart || isDraggingCropEnd ? waveformLeftCropPos : waveformLeftPos}%`
        }}
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
              totalWidth={waveformWidth}
              width={chunk.width}
              offset={chunk.offset}
              scrollLeft={scrollLeft}
            />
          ))}
          
 
        </div>
      </div>
      {/* Crop handles */}
      {showCropHandles && !isDraggingCropStart && !isDraggingCropEnd && !readonly && (
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

    {/* Context Menu */}
    {showContextMenu && (
      <div 
        className={styles.contextMenu} 
        style={{ 
          top: `${contextMenuPosition.y}px`, 
          left: `${contextMenuPosition.x}px`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={handleRegionDelete}
          style={{ color: '#ff3b30' }}
        >
          Delete Region
        </button>
      </div>
    )}
    </div>
  );
} 