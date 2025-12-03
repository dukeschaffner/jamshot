import React, { useRef, useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import styles from './Track.module.css';
import contextMenuStyles from './ContextMenu.module.css';
import Region from './Region';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { useDAW } from '../DAWContext';
import DAWConfig from '../misc/DAWConfig';


const Track = ({
  track,
  tracksScrollContainerRef
}) => {

  const trackRef = useRef(null);  
  const [regions, setRegions] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Recording state
  const [recordingStartPos, setRecordingStartPos] = useState(0);
  const [recordingWidth, setRecordingWidth] = useState(0);
  
  // Get DAW context for recording state and playhead position
  const { isRecording, playheadLocation, duration, isCollab, clipboard, pasteRegion, tracksContainerWidth } = useDAW();
  
  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [pasteTime, setPasteTime] = useState(null);

  const durationRef = useRef(duration);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    const regions = [];
    for(const region of track.regions) {
      regions.push(region);
    }
    setRegions(regions);
  }, [track]);

  useEffect(() => {
    const handleRegionAdd = (data) => {
      if (data.trackId === track.id) {
        if(regions.find(region => region.id === data.region.id)) return; // Don't add region if it already exists
        setRegions(prevRegions => [...prevRegions, data.region]);
      }
    };
    
    const handleRegionUpdate = (data) => {
      if (data.trackId === track.id) {
        setRegions(prevRegions => prevRegions.map(region => region.id === data.region.id ? data.region : region));
      }
    };

    const handleRegionRemove = (data) => {
      if (data.trackId === track.id) {
        setRegions(prevRegions => prevRegions.filter(region => region.id !== data.region.id));
      }
    };

    // Listen for recording started event
    const handlePlaybackStarted = (data) => {
      // Convert current playhead time to percentage position
      const startPos = (data.playbackTime / duration) * 100;
      setRecordingStartPos(startPos);
      setRecordingWidth(0);
    };

    eventBus.on(DAW_EVENTS.REGION.ADDED, handleRegionAdd);
    eventBus.on(DAW_EVENTS.REGION.UPDATED, handleRegionUpdate);
    eventBus.on(DAW_EVENTS.REGION.REMOVED, handleRegionRemove);
    eventBus.on(DAW_EVENTS.PLAYBACK.STARTED, handlePlaybackStarted);
    
    return () => {
      eventBus.off(DAW_EVENTS.REGION.ADDED, handleRegionAdd);
      eventBus.off(DAW_EVENTS.REGION.UPDATED, handleRegionUpdate);
      eventBus.off(DAW_EVENTS.REGION.REMOVED, handleRegionRemove);
      eventBus.off(DAW_EVENTS.PLAYBACK.STARTED, handlePlaybackStarted);
    };
  }, [duration]);

  // Update recording width when recording and playhead position changes
  useEffect(() => {
    if (track.isRecordingTrack && isRecording && duration > 0) {
      const currentPos = (playheadLocation.time / duration) * 100;
      const indicatorWidth = currentPos - recordingStartPos;
      setRecordingWidth(indicatorWidth > 0 ? indicatorWidth : 0);
    } else {
      setRecordingWidth(0);
    }
  }, [isRecording, playheadLocation.time, recordingStartPos, duration]);

  // File processing function from RecordingWidget
  const processAudioChunks = async (chunks) => {
    if (!chunks || chunks.length === 0) return;
    
    try {
      // Create blob from chunks
      const blob = new Blob(chunks, { type: 'audio/webm' });
      
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      
      // Create audio context for decoding
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      return audioBuffer;
    } catch (error) {
      console.error('Error processing audio chunks:', error);
    }
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };
  
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    await createRegionFromFile(file);
  };

  // File handling functions from RecordingWidget
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    await createRegionFromFile(file);
  };

  const createRegionFromFile = async (file) => {
    if (!file) return;
    
    // Check if file is an audio file
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file');
      return;
    }
    
    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Create chunks
      const chunks = [new Uint8Array(arrayBuffer)];
      
      // Process the file
      const fileBuffer = await processAudioChunks(chunks);
      
      if (fileBuffer) {
        if (fileBuffer.duration > DAWConfig.audio.maxFileUploadDuration) {
          const minutes = Math.floor(DAWConfig.audio.maxFileUploadDuration / 60);
          alert(`File is too long. Please select a file shorter than ${minutes} minutes.`);
          return;
        }

        let endTime = fileBuffer.duration;
        if(!isCollab) { // Set DAW duration to file duration or max upload duration
          let duration = fileBuffer.duration;
          if(duration > DAWConfig.audio.maxRecordingDuration) {
            duration = DAWConfig.audio.maxRecordingDuration;
            endTime = duration;
          }
          eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: duration });
        }
        else if (fileBuffer.duration > durationRef.current) {
          endTime = durationRef.current;
        }

        // Create a new region from the file
        track.addRegionFromBuffer(fileBuffer, 0, 0, endTime, file.name);
      }
    } catch (error) {
      console.error('Error processing uploaded file:', error);
    }
  };

  // Handle right-click on track for context menu
  const handleTrackContextMenu = (e) => {
    // Don't show track context menu if clicking on a region (regions handle their own)
    // Check if the click target or its parents have region-related classes
    let target = e.target;
    while (target && target !== e.currentTarget) {
      if (target.className && typeof target.className === 'string' && 
          (target.className.includes('region') || target.className.includes('Region'))) {
        return;
      }
      target = target.parentElement;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    if (isRecording) return;
    
    // Calculate time position based on click location
    // Find the tracksAndTimelineContainer parent to match timeline calculation
    if (trackRef.current && duration > 0 && tracksScrollContainerRef && tracksScrollContainerRef.current) {
      // Find the tracksAndTimelineContainer by traversing up the DOM
      let container = trackRef.current.parentElement;
      while (container && !container.className?.toString().includes('tracksAndTimelineContainer')) {
        container = container.parentElement;
      }
      
      if (container) {
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const timePosition = (clickX / rect.width) * duration;
        setPasteTime(Math.max(0, Math.min(timePosition, duration)));
      }
    }
    
    // Emit event to close other context menus
    eventBus.emit(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, { source: 'track' });
    
    // Position context menu at mouse position
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Handle paste from context menu
  const handleTrackPaste = () => {
    if (isRecording) return;
    
    if (clipboard && clipboard.trackId === track.id) {
      // Use pasteTime if available (from right-click position), otherwise use playhead
      pasteRegion(pasteTime !== null ? pasteTime : undefined);
    }
    setShowContextMenu(false);
    setPasteTime(null);
  };

  // Check if paste is available for this track
  const canPaste = clipboard && clipboard.trackId === track.id;

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

  // Listen for other context menus opening and close this one
  useEffect(() => {
    const handleOtherContextMenuOpen = (data) => {
      // Close this context menu if another one opens (unless it's this same one)
      if (data.source !== 'track') {
        setShowContextMenu(false);
      }
    };

    eventBus.on(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, handleOtherContextMenuOpen);

    return () => {
      eventBus.off(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, handleOtherContextMenuOpen);
    };
  }, []);

  return (
    <div 
      className={styles.track} 
      ref={trackRef}
      onContextMenu={handleTrackContextMenu}
    >
        {/* Always show regions when they exist */}
        {regions.length > 0 ? (
          regions.map((region, index) => (
            region.active && (
              <Region 
                key={index}
                region={region}
                bufferKey={region.key} 
                trackRef={trackRef} 
                track={track} 
                tracksScrollContainerRef={tracksScrollContainerRef}
                isRecordingTrack={track.isRecordingTrack}
              />
            )
          ))
        ) : (
          !isRecording && (
            <div 
              className={`${styles.emptyTrack} ${isDragOver ? styles.dragOver : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById(`audio-file-input-${track.id}`).click();
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="empty-message">
                <FontAwesomeIcon icon={faCloudUploadAlt} />
                <span>Upload audio file or start recording</span>
                <input 
                  type="file" 
                  id={`audio-file-input-${track.id}`}
                  className={styles.fileUploadInput} 
                  accept="audio/*"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )
        )}
        {/* Recording indicator - shown as overlay during recording */}
        {isRecording && track.isRecordingTrack && recordingWidth > 0 && (
          <div 
            className={styles.recordingIndicator}
            style={{
              left: `${recordingStartPos}%`,
              width: `${recordingWidth}%`
            }}
          />
        )}
        
        {/* Track Context Menu */}
        {showContextMenu && (
          <div 
            className={contextMenuStyles.contextMenu} 
            style={{ 
              top: `${contextMenuPosition.y}px`, 
              left: `${contextMenuPosition.x}px`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {canPaste && (
              <button 
                onClick={handleTrackPaste}
                disabled={isRecording}
              >
                Paste Region
              </button>
            )}
          </div>
        )}
    </div>
  );
};

export default Track;