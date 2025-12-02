'use client';

import { useState, useEffect, useRef } from 'react';
import { useDAW, DAWProvider } from './DAWContext';
import { eventBus } from './misc/EventBus';
import { DAW_EVENTS } from './misc/DAWEvents';
import Waveform from './components/Region';
import Playhead from './components/Playhead';
import api from '../../lib/api';
import TransportControls from './components/TransportControls';
import ZoomSlider from './components/ZoomSlider';
import styles from './DAW.module.css';
import contextMenuStyles from './components/ContextMenu.module.css';
import Track from './components/Track';
import Looper from './components/Looper';
import TrackHeader from './components/TrackHeader';
import MusicalGrid from './components/MusicalGrid';
import Takes from './components/Takes';
import { useNavigationGuard } from 'next-navigation-guard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import UploadForm from './components/UploadForm';
import TimeDisplay from './components/TimeDisplay';
import ProjectEndOverlay from './components/ProjectEndOverlay';

function DAWContent({ track}) {
  const {
    isCollab,
    trackManagerRef,
    audioEngineRef,
    trackData,
    isLoading,
    error,
    tracks,
    isPlaying,
    isRecording,
    playheadLocation,
    metronomeBpm,
    timeSignature,
    metronomeOffset,
    duration,
    zoom,
    setZoomLevel,
    scrollLeft,
    setScrollLeftValue,
    tracksContainerWidth,
    setTracksContainerWidth,
    recordingTrackHasAudio,
    selectedRegionId,
    selectedTrackId,
    copyRegion,
    pasteRegion,
    repeatRegion,
    clipboard,
    clearSelection,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useDAW();

  const [saved, setSaved] = useState(false);

  useNavigationGuard({ 
    enabled: !!recordingTrackHasAudio && !saved, 
    confirm: () => window.confirm("You have unsaved recordings. Are you sure you want to leave? Your recordings will be lost.") 
  });

  const tracksAndTimelineRef = useRef(null);
  const tracksScrollContainerRef = useRef(null);
  const [tracksContainer, setTracksContainer] = useState(null);

  const [showUploadForm, setShowUploadForm] = useState(false);
  
  // Timeline context menu state
  const [showTimelineContextMenu, setShowTimelineContextMenu] = useState(false);
  const [timelineContextMenuPosition, setTimelineContextMenuPosition] = useState({ x: 0, y: 0 });
  const [timelinePasteTime, setTimelinePasteTime] = useState(null);


  // Add keyboard event listener for space and enter keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input field, textarea, or contentEditable element
      if (
        e.target.tagName === 'INPUT' || 
        e.target.tagName === 'TEXTAREA' || 
        e.target.isContentEditable
      ) {
        return;
      }

      // Handle space key for play/pause
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault(); // Prevent space from scrolling the page
        
        if (isRecording) {
          // Stop recording if currently recording
          eventBus.emit(DAW_EVENTS.RECORDING.STOP);
        } else {
          // Toggle play/pause
          if (isPlaying) {
            eventBus.emit(DAW_EVENTS.TRANSPORT.PAUSE);
          } else {
            eventBus.emit(DAW_EVENTS.TRANSPORT.PLAY);
          }
        }
      }
      // Handle enter key for seek to time 0
      else if (e.code === 'Enter' || e.key === 'Enter') {
        e.preventDefault();
        eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: 0 });
      }
      // Handle Cmd/Ctrl+Z for undo (with shift for redo)
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z')) {
        if (!isRecording) {
          e.preventDefault();
          if (e.shiftKey) {
            // Cmd/Ctrl+Shift+Z for redo
            if (canRedo) {
              redo();
            }
          } else {
            // Cmd/Ctrl+Z for undo
            if (canUndo) {
              undo();
            }
          }
        }
      }
      // Handle Cmd/Ctrl+Y for redo (alternative)
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyY' || e.key === 'y' || e.key === 'Y')) {
        if (!isRecording && canRedo) {
          e.preventDefault();
          redo();
        }
      }
      // Handle Cmd/Ctrl+C for copy
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyC' || e.key === 'c' || e.key === 'C')) {
        if (selectedRegionId && !isRecording) {
          e.preventDefault();
          copyRegion();
        }
      }
      // Handle Cmd/Ctrl+V for paste
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyV' || e.key === 'v' || e.key === 'V')) {
        if (clipboard && !isRecording) {
          e.preventDefault();
          pasteRegion();
        }
      }
      // Handle Cmd/Ctrl+R for repeat region
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) {
        if (selectedRegionId && !isRecording) {
          e.preventDefault();
          repeatRegion();
        }
      }
      // Handle 'r' key for recording (only when no modifiers are pressed)
      else if (!e.metaKey && !e.ctrlKey && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (isRecording) {
          // Stop recording if currently recording
          eventBus.emit(DAW_EVENTS.RECORDING.STOP);
        } else {
          // Start recording if not currently recording
          eventBus.emit(DAW_EVENTS.RECORDING.START);
        }
      }
      // Handle Delete/Backspace key for deleting selected region
      else if ((e.code === 'Delete' || e.code === 'Backspace' || e.key === 'Delete' || e.key === 'Backspace') && !isRecording) {
        if (selectedRegionId && selectedTrackId && trackManagerRef && trackManagerRef.current) {
          e.preventDefault();
          const track = trackManagerRef.current.getTrack(selectedTrackId);
          if (track) {
            // Prevent deletion if this is the only region left in a non-recording track
            if (!track.isRecordingTrack) {
              const activeRegions = track.getActiveRegions();
              if (activeRegions.length <= 1) {
                return; // Don't allow deletion of the last region
              }
            }
            
            const region = track.regions.find(r => r.id === selectedRegionId);
            if (region) {
              eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
                region: region,
                trackId: selectedTrackId
              });
            }
          }
        }
      }
    };

    // Add event listener to the window
    window.addEventListener('keydown', handleKeyDown);

    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, isRecording, selectedRegionId, selectedTrackId, clipboard, copyRegion, pasteRegion, repeatRegion, canUndo, canRedo, undo, redo]); // Include dependencies

  const handleTimelineClick = (e) => {
    e.stopPropagation();
    if (isRecording) return;
    const rect = tracksAndTimelineRef.current.getBoundingClientRect();
    const time = (e.clientX - rect.left) / rect.width * duration;
    eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: time });
    // Clear selection when clicking on timeline
    clearSelection();
  };

  // Handle right-click on timeline for context menu
  const handleTimelineContextMenu = (e) => {
    // Don't show timeline context menu if clicking on a region or track
    let target = e.target;
    while (target && target !== e.currentTarget) {
      if (target.className && typeof target.className === 'string' && 
          (target.className.includes('region') || target.className.includes('Region') ||
           target.className.includes('track') || target.className.includes('Track'))) {
        return;
      }
      target = target.parentElement;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    if (isRecording) return;
    
    // Calculate time position based on click location
    if (tracksAndTimelineRef.current) {
      const rect = tracksAndTimelineRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const timePosition = (clickX / rect.width) * duration;
      setTimelinePasteTime(Math.max(0, Math.min(timePosition, duration)));
    }
    
    // Emit event to close other context menus
    eventBus.emit(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, { source: 'timeline' });
    
    // Position context menu at mouse position
    setTimelineContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowTimelineContextMenu(true);
  };

  // Handle paste from timeline context menu (pastes to the track that was copied from)
  const handleTimelinePaste = () => {
    if (isRecording) return;
    
    if (clipboard) {
      // Use timelinePasteTime if available (from right-click position), otherwise use playhead
      pasteRegion(timelinePasteTime !== null ? timelinePasteTime : undefined);
    }
    setShowTimelineContextMenu(false);
    setTimelinePasteTime(null);
  };

  // Handle click outside timeline context menu to close it
  useEffect(() => {
    const handleClickOutside = () => {
      setShowTimelineContextMenu(false);
    };
    
    if (showTimelineContextMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showTimelineContextMenu]);

  // Listen for other context menus opening and close this one
  useEffect(() => {
    const handleOtherContextMenuOpen = (data) => {
      // Close this context menu if another one opens (unless it's this same one)
      if (data.source !== 'timeline') {
        setShowTimelineContextMenu(false);
      }
    };

    eventBus.on(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, handleOtherContextMenuOpen);

    return () => {
      eventBus.off(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, handleOtherContextMenuOpen);
    };
  }, []);

  const handleMetronomeOffsetChange = (newOffset) => {
    eventBus.emit(DAW_EVENTS.METRONOME.OFFSET_CHANGE, { offset: newOffset });
  };

  // Listen to track rect width changes
  useEffect(() => {
    if (!tracksContainer) return;

    const updateTrackRectWidth = () => {
      if (tracksContainer) {
        const rect = tracksContainer.getBoundingClientRect();
        setTracksContainerWidth(rect.width);
      }
    };

    // Initial measurement
    updateTrackRectWidth();

    // Set up ResizeObserver to watch for width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTracksContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(tracksContainer);

    // Cleanup
    return () => {
      if (tracksContainer) {
        resizeObserver.unobserve(tracksContainer);
      }
      resizeObserver.disconnect();
    };
  }, [tracksContainer]);

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.dawContainer}>
        <div>Loading DAW...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className={styles.dawContainer}>
        <div>Error: {error}</div>
      </div>
    );
  }

  return (
    <>
      <div 
        className={styles.dawContainer}
        style={{display: showUploadForm ? 'none' : 'block'}}
      >
          <div className={styles.dawControls}>
            <TransportControls
              isRecording={isRecording}
              isPlaying={isPlaying}
              metronomeBpm={metronomeBpm}
              timeSignature={timeSignature}
            />
            <TimeDisplay />
            <div>
              {recordingTrackHasAudio && !isRecording && (track ? track.layer < 4 : true) && (
                  <button
                    className="pill-btn gradient-btn"
                    style={{justifySelf: 'end'}}
                    onClick={() => setShowUploadForm(true)}
                    title="Upload Recording"
                  >
                    <FontAwesomeIcon icon={faUpload} />
                    Go To: Upload
                  </button>
              )}
            </div>
          </div>

        
        <div className={styles.dawBody}>
          <div className={styles.tracks}>
          <div className={styles.tracksHeaders}>
            {tracks.map((track, index) => (
              <TrackHeader
                key={`${track.id}-${index}`}
                track={track}
                trackData={trackData && trackData.length > 0 ? trackData[0] : null}
              />
            ))}
          </div>
          <div 
            className={styles.tracksScrollContainer} 
            onScroll={(e) => setScrollLeftValue(e.currentTarget.scrollLeft)} 
            ref={tracksScrollContainerRef}
          >
            {tracks.length > 0 && (
              <>
                <div 
                  className={styles.tracksAndTimelineContainer}
                  ref={tracksAndTimelineRef}
                  onClick={handleTimelineClick}
                  onContextMenu={handleTimelineContextMenu}
                  style={{
                    width: `${Math.max(100, zoom * 100)}%`,
                    minWidth: `${Math.max(100, zoom * 100)}%`,
                  }}
                >
                  <div className={styles.timeline}>
                    <MusicalGrid
                      bpm={metronomeBpm}
                      timeSignature={timeSignature}
                      duration={duration}
                      metronomeOffset={metronomeOffset}
                      onMetronomeOffsetChange={handleMetronomeOffsetChange}
                      isPlaying={isPlaying}
                      zoom={zoom}
                    />
                    <Looper/>
                  </div>
                  <div className={styles.tracksContainer} ref={setTracksContainer}>
                    {tracks.map((track, index) => (
                      <Track key={index} track={track} tracksScrollContainerRef={tracksScrollContainerRef}/>
                    ))}
                    <Playhead/>
                  </div>
                  
                  <ProjectEndOverlay 
                    containerRef={tracksAndTimelineRef}
                    duration={duration}
                    zoom={zoom}
                  />
                  
                  {/* Timeline Context Menu */}
                  {showTimelineContextMenu && (
                    <div 
                      className={contextMenuStyles.contextMenu} 
                      style={{ 
                        top: `${timelineContextMenuPosition.y}px`, 
                        left: `${timelineContextMenuPosition.x}px`
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {clipboard && (
                        <button 
                          onClick={handleTimelinePaste}
                          disabled={isRecording}
                        >
                          Paste Region
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {zoom > 1 && (
                  <div className={styles.zoomIndicator}>
                    Zoom: {zoom.toFixed(1)}x
                  </div>
                )}
              </>
            )}
          </div>
          </div>
          <ZoomSlider
              zoom={zoom}
              onZoomChange={setZoomLevel}
            />
        </div>
      </div>

      {recordingTrackHasAudio && showUploadForm && (
        <UploadForm
          isCollab={isCollab}
          hasActiveCompetition={track?.has_active_competition || false}
          onCancel={() => {
            setShowUploadForm(false);
          }}
          onUploadComplete={() => {
            console.log("Upload completed successfully!");
            setSaved(true);
          }}
        />
      )}
      </>
  );
}


// Main DAW component that provides the context
function DAW({ track }) {
  // Convert track data to the format expected by DAWContext
  const trackData = track ? [track] : [];
  const isCollab = track ? true : false;
  
  return (
    <DAWProvider trackData={trackData} isCollab={isCollab}>
      <DAWContent track={track}/>
    </DAWProvider>
  );
}

export default DAW;