'use client';

import styles from './Region.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { bufferRegistry } from '../core/BufferRegistry';
import WaveformChunk from './waveform/WaveformChunk';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import DAWConfig from '../misc/DAWConfig';
import { snapToGrid, handleRegionOverlaps } from '../misc/DAWUtils';
import { COMMAND_TYPES } from '../core/UndoManager';

export default function Region({ 
  region,
  bufferKey,
  trackRef,
  track,
  tracksScrollContainerRef,
  isRecordingTrack = false
}) {
  const { 
    scrollLeft, 
    duration, 
    zoom, 
    isPlaying, 
    isRecording, 
    tracksContainerWidth, 
    gridLines, 
    selectedRegionId, 
    selectedTrackId, 
    selectRegion, 
    clearSelection, 
    copyRegion, 
    pasteRegion, 
    repeatRegion, 
    clipboard, 
    trackManagerRef,
    setContextMenuItems,
    setContextMenuPosition,
    setShowContextMenu,
  } = useDAW();


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
  const hasDraggedRef = useRef(false);

  // Store original state for undo tracking
  const originalStateRef = useRef(null);

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
      const regionWidth = (region.endTime - region.startTime) / duration * 100;
      setWidth(regionWidth);

      // Set initial region position
      const regionLeftPos = region.startTime / duration * 100;
      setRegionLeftPos(regionLeftPos);
    }
  }, [bufferKey, track, duration]);

  // Update local state when region prop changes (e.g., when trimmed by another region)
  useEffect(() => {
    if (!region || !duration) return;

    setStartTime(region.startTime);
    setEndTime(region.endTime);
    setOffset(region.offset);
    const regionWidth = (region.endTime - region.startTime) / duration * 100;
    setWidth(regionWidth);

    // Update region position
    const regionLeftPos = region.startTime / duration * 100;
    setRegionLeftPos(regionLeftPos);
  }, [region, duration]);


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
    
    // Select region immediately on left click
    selectRegion(region.id, track.id);
    
    // Capture original state for undo
    originalStateRef.current = {
      startTime: region.startTime,
      endTime: region.endTime,
      offset: region.offset,
      key: region.key,
      duration: region.duration,
      active: region.active,
      name: region.name
    };
    
    setIsDraggingRegion(true);
    hasDraggedRef.current = false;
    setDragStartX(e.clientX);
    const regionLeftPixels = regionLeftPos * tracksContainerWidth / 100;
    setRegionStartPosBeforeDrag(regionLeftPixels);
  };

  // Handle right-click for context menu
  const handleRegionContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isRecording) return;

    // Emit event to close other context menus (including other regions)
    eventBus.emit(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, { source: 'region', regionId: region.id });

    // Set context menu items and position context menu at mouse position
    setContextMenuItems(menuItems);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Handle region deletion
  const handleRegionDelete = () => {
    if (isRecording) return;
    
    // Prevent deletion if this is the only region left in a non-recording track
    if (track && region) {
      if(!isRecordingTrack) {
      const activeRegions = track.getActiveRegions();
        if (activeRegions.length <= 1) {
          // Don't allow deletion of the last region in non-recording tracks
          setShowContextMenu(false);
          return;
        }
      }
      
      eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
        region: region,
        trackId: track.id
      });
    }

    // Hide context menu
    setShowContextMenu(false);
  };

  // Handle copy region
  const handleRegionCopy = () => {
    if (isRecording) return;
    
    selectRegion(region.id, track.id);
    copyRegion();
    setShowContextMenu(false);
  };

  // Handle paste region
  const handleRegionPaste = () => {
    if (isRecording) return;
    
    if (clipboard && clipboard.trackId === track.id) {
      pasteRegion();
    }
    setShowContextMenu(false);
  };

  // Handle repeat region
  const handleRegionRepeat = () => {
    if (isRecording) return;
    
    // Select the region first if not already selected
    if (!isSelected) {
      selectRegion(region.id, track.id);
    }
    
    // Calculate the new start time (immediately after the region ends)
    const newStartTime = region.endTime;
    const regionDuration = region.endTime - region.startTime;
    let newEndTime = newStartTime + regionDuration;

    // If repeated region extends past project end, cut it to end at project end
    if (newEndTime > duration) {
      newEndTime = duration;
    }

    // Don't add if the new start time is beyond the project duration
    if (newStartTime >= duration) {
      setShowContextMenu(false);
      return;
    }

    // Add the repeated region directly using track manager
    if (trackManagerRef && trackManagerRef.current) {
      const trackInstance = trackManagerRef.current.getTrack(track.id);
      if (trackInstance) {
        const newRegion = trackInstance.addRegion(
          region.key,
          newStartTime,
          region.offset,
          newEndTime,
          region.name,
          false, // overwriteTrack
          true   // recordUndo - record this for undo/redo
        );
        
        // Select the newly created region so the next Ctrl+R will repeat it
        if (newRegion) {
          selectRegion(newRegion.id, track.id);
        }
      }
    }
    
    setShowContextMenu(false);
  };

  // Check if this region is selected
  const isSelected = selectedRegionId === region.id && selectedTrackId === track.id;
  
  // Check if paste is available for this track
  const canPaste = clipboard && clipboard.trackId === track.id;
  
  // Check if delete should be shown (hide if it's the last region in a non-recording track)
  const canDelete = isRecordingTrack || (track && track.getActiveRegions().length > 1);


  // Mouse event handlers for region dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRegion) return;
      const deltaX = e.clientX - dragStartX;
      
      // Track that the mouse has moved (dragged)
      if (Math.abs(deltaX) > 1) {
        hasDraggedRef.current = true;
      }
      
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
      const wasDragging = hasDraggedRef.current;
      setIsDraggingRegion(false);
      hasDraggedRef.current = false;

      // Only update the region's start time if it was actually dragged
      if (wasDragging && track && bufferKey && duration && tracksContainerWidth) {
        // Use the snapped position for calculating the new start time
        const snappedRegionLeftPos = snapToGrid(regionLeftPos, snapToGridEnabled, duration, musicGridLinesRef.current, tracksContainerWidthRef.current, DAWConfig.ui.gridSnapThreshold);
        const newStartTime = (snappedRegionLeftPos / 100) * duration;
        const regionDuration = endTime - startTime;
        const newEndTime = newStartTime + regionDuration;

        // Check for overlaps with other regions and handle them
        handleRegionOverlaps(track, region.id, newStartTime, newEndTime, track.id, eventBus, DAW_EVENTS);

        // Update the region in the track
        const updatedRegion = {
          ...region,
          startTime: newStartTime,
          endTime: newEndTime
        };

        // Build action metadata for undo if position actually changed
        const shouldRecordUndo = originalStateRef.current && 
            (originalStateRef.current.startTime !== newStartTime || 
             originalStateRef.current.endTime !== newEndTime);

        // Emit event to update the track manager (with optional undo action metadata)
        eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
          region: updatedRegion,
          trackId: track.id,
          ...(shouldRecordUndo && {
            action: {
              canUndo: true,
              type: COMMAND_TYPES.REGION_MOVE,
              before: { ...originalStateRef.current },
              description: 'Move Region'
            }
          })
        });

        // Update local state
        setStartTime(newStartTime);
        setEndTime(newEndTime);
      }
      
      // Clear original state reference
      originalStateRef.current = null;
    };
    
    if (isDraggingRegion) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRegion, dragStartX, regionStartPosBeforeDrag, regionLeftPos, widthPx, track, bufferKey, duration, tracksContainerWidth, tracksScrollContainerRef, region, endTime, startTime, snapToGridEnabled, selectRegion]);

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
    e.stopPropagation();
    
    // Capture original state for undo
    originalStateRef.current = {
      startTime: region.startTime,
      endTime: region.endTime,
      offset: region.offset,
      key: region.key,
      duration: region.duration,
      active: region.active,
      name: region.name
    };
    
    setIsDraggingCropStart(true);
    setDragStartX(e.clientX);
  };

  // Handle mouse down on crop end handle
  const handleCropEndMouseDown = (e) => {
    e.stopPropagation();
    
    // Capture original state for undo
    originalStateRef.current = {
      startTime: region.startTime,
      endTime: region.endTime,
      offset: region.offset,
      key: region.key,
      duration: region.duration,
      active: region.active,
      name: region.name
    };
    
    setIsDraggingCropEnd(true);
    setDragStartX(e.clientX);
  };

  // Check if mouse is hovering near edges to show crop handles
  const handleWaveformMouseMove = (e) => {
    // Allow trimming for non-recording tracks (isRecordingTrack is false)
    if (!regionContainerRef.current) return;
    
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

  const menuItems = [
    {
      label: "Copy Region",
      action: () => handleRegionCopy(),
    },
    ...(canPaste ? [
      {
        label: "Paste Region",
        action: () => handleRegionPaste(),
      }
    ] : []),
    {
      label: "Repeat Region (Cmd/Ctrl+R)",
      action: () => handleRegionRepeat(),
    },
    ...(canDelete ? [
      {
        label: "Delete Region",
        action: () => handleRegionDelete(),
      }
    ] : []),
  ];

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
        
        
        // Check for overlaps with other regions and handle them
        handleRegionOverlaps(track, region.id, newStartTime, newEndTime, track.id, eventBus, DAW_EVENTS);
        
        // Update the region in the track 
        const updatedRegion = {
          ...region,
          startTime: newStartTime,
          endTime: newEndTime,
          offset: newOffset
        };
        
        // Build action metadata for undo if crop actually changed something
        const shouldRecordUndo = originalStateRef.current && 
            (originalStateRef.current.startTime !== newStartTime || 
             originalStateRef.current.endTime !== newEndTime ||
             originalStateRef.current.offset !== newOffset);
        
        // Emit event to update the track manager (with optional undo action metadata)
        eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
          region: updatedRegion,
          trackId: track.id,
          ...(shouldRecordUndo && {
            action: {
              canUndo: true,
              type: COMMAND_TYPES.REGION_CROP,
              before: { ...originalStateRef.current },
              description: 'Crop Region'
            }
          })
        });
        
        // Update local state
        setStartTime(newStartTime);
        setEndTime(newEndTime);
        setOffset(newOffset);
      }

      setIsDraggingCropStart(false);
      setIsDraggingCropEnd(false);
      
      // Clear original state reference
      originalStateRef.current = null;
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
      className={`${styles.region} ${isDraggingCropStart || isDraggingCropEnd ? styles.cropping : ''} ${isDraggingRegion ? styles.dragging : ''} ${isSelected ? styles.selected : ''}`} 
      style={{ 
        width: `${isDraggingCropStart || isDraggingCropEnd ? regionCropWidth : width}%`, 
        height: '100%',
        left: `${isDraggingCropStart || isDraggingCropEnd ? regionCropLeftPos : regionLeftPos}%`,
        cursor: isRecording ? 'default' : (isDraggingRegion ? 'grabbing' : 'grab')
      }}
      ref={regionContainerRef}
      onClick={e => e.stopPropagation()}
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
      {showCropHandles && !isDraggingCropStart && !isDraggingCropEnd && (
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