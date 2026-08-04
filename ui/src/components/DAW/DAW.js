'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useDAW, DAWProvider } from './DAWContext';
import { ProjectEditorProvider, useProjectEditor } from './project/ProjectEditorContext';
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
import { useNavigationGuardHook } from '../../contexts/NavigationGuardContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import UploadForm from './components/UploadForm';
import TimeDisplay from './components/TimeDisplay';
import ProjectEndOverlay from './components/ProjectEndOverlay';
import ProjectSnapshotsPanel from './project/ProjectSnapshotsPanel';
import ProjectSnapshotPreviewBanner from './project/ProjectSnapshotPreviewBanner';
import ProjectFilesPanel from './project/ProjectFilesPanel';
import ProjectTrackHeadersList from './project/ProjectTrackHeadersList';
import ContextMenu from './components/ContextMenu';
import PluginInviteHint from './components/PluginInviteHint';
import { useTimelineWheelControls } from './hooks/useTimelineWheelControls';
import { useToast } from '../../lib/ToastContext';
import ConfirmationDialog from '../ConfirmationDialog';
import { captureDawLeaveUnsavedConfirmed, captureDawUploadFormOpened } from '../../lib/posthogAnalytics';

function DAWContent({ track, isVisible = true }) {
  const {
    dawMode,
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
    viewWidth,
    setViewWidth,
    recordingTrackHasAudio,
    selectedRegionId,
    selectedTrackId,
    copyRegion,
    pasteRegion,
    repeatRegion,
    splitRegion,
    clipboard,
    clearSelection,
    canUndo,
    canRedo,
    undo,
    redo,
    contextMenuItems,
    contextMenuPosition,
    showContextMenu,
    setShowContextMenu,
    isLoop,
  } = useDAW();
  const {
    isActive: isProjectEditor,
    canEdit: canEditProject,
    hasInFlightClipWork,
    armedTrackId,
    startProjectRecording,
    deleteProjectRegion,
    pasteProjectRegion,
    repeatProjectRegion,
    splitProjectRegion,
    isSnapshotPreview,
    snapshotPreviewMeta,
    exitSnapshotPreview,
  } = useProjectEditor();

  const { showToast } = useToast();
  const [saved, setSaved] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isSnapshotsOpen, setIsSnapshotsOpen] = useState(false);
  const isProjectMode = dawMode === 'project';

  useEffect(() => {
    if (!isVisible) return;
    try {
      const key = 'sterio_daw_welcome_seen_v1';
      const hasSeen = localStorage.getItem(key) === 'true';
      if (!hasSeen) {
        setShowWelcomeModal(true);
      }
    } catch {
      // If localStorage is unavailable, just don't block DAW usage.
    }
  }, [isVisible]);

  const dismissWelcomeModal = () => {
    try {
      localStorage.setItem('sterio_daw_welcome_seen_v1', 'true');
    } catch {
      // ignore
    }
    setShowWelcomeModal(false);
  };

  useNavigationGuardHook({
    enabled:
      (!isProjectMode && !!recordingTrackHasAudio && !saved) ||
      (isProjectMode && hasInFlightClipWork),
    confirm: () => {
      const ok = window.confirm(
        isProjectMode
          ? 'A clip is still uploading or processing. Leave anyway? Unsaved local audio may be lost.'
          : "You have unsaved recordings. Are you sure you want to leave? Your recordings will be lost."
      );
      if (ok && !isProjectMode) {
        captureDawLeaveUnsavedConfirmed({
          upload_flow_type: isCollab ? 'collab' : 'original',
        });
      }
      return ok;
    },
  });

  useEffect(() => {
    if (!isProjectMode || !hasInFlightClipWork) return;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProjectMode, hasInFlightClipWork]);

  const tracksAndTimelineRef = useRef(null);
  const tracksViewportRef = useRef(null);
  const tracksScrollContainerRef = useRef(null);
  const [tracksContainer, setTracksContainer] = useState(null);

  const [showUploadForm, setShowUploadForm] = useState(false);

  useEffect(() => {
    if (!showUploadForm) return;
    captureDawUploadFormOpened({
      upload_flow_type: isCollab ? 'collab' : 'original',
    });
  }, [showUploadForm, isCollab]);

  // Add keyboard event listener for space and enter keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input field, textarea, or contentEditable element
      if (!isVisible) return;
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }

      // Ignore if upload form is open
      if (showUploadForm) {
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
      else if (!isProjectMode && (e.metaKey || e.ctrlKey) && (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z')) {
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
      else if (!isProjectMode && (e.metaKey || e.ctrlKey) && (e.code === 'KeyY' || e.key === 'y' || e.key === 'Y')) {
        if (!isRecording && canRedo) {
          e.preventDefault();
          redo();
        }
      }
      // Handle Cmd/Ctrl+C for copy
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyC' || e.key === 'c' || e.key === 'C')) {
        if (selectedRegionId && !isRecording) {
          if (isProjectMode && !canEditProject) return;
          e.preventDefault();
          copyRegion();
        }
      }
      // Handle Cmd/Ctrl+V for paste
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyV' || e.key === 'v' || e.key === 'V')) {
        if (clipboard && !isRecording) {
          if (isProjectMode) {
            if (!canEditProject) return;
            e.preventDefault();
            void pasteProjectRegion();
            return;
          }
          e.preventDefault();
          pasteRegion();
        }
      }
      // Handle Cmd/Ctrl+R for repeat region
      else if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) {
        if (selectedRegionId && !isRecording) {
          if (isProjectMode) {
            if (!canEditProject) return;
            e.preventDefault();
            void repeatProjectRegion();
            return;
          }
          e.preventDefault();
          repeatRegion();
        }
      }
      // Handle 't' key for split region (only when no modifiers are pressed)
      else if (!e.metaKey && !e.ctrlKey && (e.code === 'KeyT' || e.key === 't' || e.key === 'T')) {
        if (selectedRegionId && !isRecording) {
          if (isProjectMode) {
            if (!canEditProject) return;
            e.preventDefault();
            void splitProjectRegion();
            return;
          }
          e.preventDefault();
          splitRegion();
        }
      }
      // Handle 'r' key for recording (only when no modifiers are pressed)
      else if (!e.metaKey && !e.ctrlKey && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (isRecording) {
          eventBus.emit(DAW_EVENTS.RECORDING.STOP);
        } else if (isProjectMode) {
          if (canEditProject) {
            void startProjectRecording();
          }
        } else {
          eventBus.emit(DAW_EVENTS.RECORDING.START);
        }
      }
      // Handle Delete/Backspace key for deleting selected region
      else if ((e.code === 'Delete' || e.code === 'Backspace' || e.key === 'Delete' || e.key === 'Backspace') && !isRecording) {
        if (selectedRegionId && selectedTrackId && trackManagerRef && trackManagerRef.current) {
          if (isProjectMode) {
            if (!canEditProject) return;
            e.preventDefault();
            deleteProjectRegion(selectedRegionId, selectedTrackId);
            return;
          }

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
  }, [isPlaying, isRecording, selectedRegionId, selectedTrackId, clipboard, copyRegion, pasteRegion, pasteProjectRegion, repeatRegion, repeatProjectRegion, splitRegion, splitProjectRegion, canUndo, canRedo, undo, redo, showUploadForm, isVisible, isProjectMode, canEditProject, startProjectRecording, armedTrackId, deleteProjectRegion, trackManagerRef]);

  // Handle toast notifications from the event bus
  useEffect(() => {
    const handleToast = (toastData) => {
      showToast(toastData);
    };

    eventBus.on(DAW_EVENTS.NOTIFICATION.TOAST, handleToast);

    return () => {
      eventBus.off(DAW_EVENTS.NOTIFICATION.TOAST, handleToast);
    };
  }, [showToast]);

  const handleTimelineClick = (e) => {
    e.stopPropagation();
    if (isRecording) return;
    const rect = tracksAndTimelineRef.current.getBoundingClientRect();
    const time = (e.clientX - rect.left) / rect.width * duration;
    eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: time });
    // Clear selection when clicking on timeline
    clearSelection();
  };




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

  // Listen to tracksScrollContainer width changes (viewWidth)
  useEffect(() => {
    if (!tracksScrollContainerRef.current) return;

    const updateViewWidth = () => {
      if (tracksScrollContainerRef.current) {
        const rect = tracksScrollContainerRef.current.getBoundingClientRect();
        setViewWidth(rect.width);
      }
    };

    // Initial measurement
    updateViewWidth();

    // Set up ResizeObserver to watch for width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(tracksScrollContainerRef.current);

    // Cleanup
    return () => {
      if (tracksScrollContainerRef.current) {
        resizeObserver.unobserve(tracksScrollContainerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [tracksScrollContainerRef.current]);

  useTimelineWheelControls({
    scrollContainerRef: tracksScrollContainerRef,
    contentRef: tracksAndTimelineRef,
    zoom,
    setZoomLevel,
    enabled: !isLoading && !error,
  });

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
      <ConfirmationDialog
        isOpen={showWelcomeModal}
        onClose={dismissWelcomeModal}
        onConfirm={dismissWelcomeModal}
        title="Welcome to the Sterio DAW"
        confirmText="Got it"
        cancelText="Close"
      >
        <>
          <p style={{ marginTop: 12 }} className="text-sm text-grey-3">
            Here, you can record or upload audio to post a new track.
          </p>
          <p style={{ marginTop: 12 }} className="text-sm text-grey-3 mb-4">
            For the smoothest experience, check out our{' '}
            <Link href="/help?article=daw-best-practices" className="link-underline text-seafoam">DAW best practices</Link>.
          </p>
        </>
      </ConfirmationDialog>
      {isProjectEditor && (
        <ProjectSnapshotsPanel
          isOpen={isSnapshotsOpen}
          onClose={() => setIsSnapshotsOpen(false)}
        />
      )}
      <div 
        className={`${styles.dawContainer} ${isProjectMode ? styles.dawContainerFill : ''}`}
        style={{display: showUploadForm ? 'none' : undefined}}
      >
          {isProjectEditor && isSnapshotPreview && (
            <ProjectSnapshotPreviewBanner
              previewMeta={snapshotPreviewMeta}
              onExit={() => {
                void exitSnapshotPreview();
              }}
            />
          )}
          <div className={styles.dawControls}>
            <TransportControls
              isRecording={isRecording}
              isPlaying={isPlaying}
              metronomeBpm={metronomeBpm}
              timeSignature={timeSignature}
              onOpenSnapshots={() => setIsSnapshotsOpen(true)}
            />
            <TimeDisplay />
            <div>
              {!isProjectMode && recordingTrackHasAudio && !isRecording && (track ? track.layer < 4 : true) && (
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

          <PluginInviteHint isVisible={isVisible} />

        <div className={styles.dawBody}>
          <div className={styles.dawMain}>
          <div className={styles.tracks} ref={tracksViewportRef}>
          {isProjectEditor ? (
            <ProjectTrackHeadersList tracks={tracks} />
          ) : (
            <div className={styles.tracksHeaders}>
              {tracks.map((track) => (
                <TrackHeader key={track.id} track={track} />
              ))}
            </div>
          )}
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
                  style={{
                    width: `${Math.max(100, zoom * 100)}%`,
                    minWidth: `${Math.max(100, zoom * 100)}%`,
                  }}
                >
                  <div className={styles.timeline}>
                    <Looper/>
                  </div>
                  <div className={styles.tracksContainer} ref={setTracksContainer}>
                    {tracks.map((track) => (
                      <Track
                        key={track.id}
                        track={track}
                        tracksScrollContainerRef={tracksScrollContainerRef}
                        tracksViewportRef={tracksViewportRef}
                      />
                    ))}
                  </div>

                  {/* Full-height overlays spanning the timeline and all track lanes */}
                  <MusicalGrid
                    bpm={metronomeBpm}
                    timeSignature={timeSignature}
                    duration={duration}
                    metronomeOffset={metronomeOffset}
                    onMetronomeOffsetChange={handleMetronomeOffsetChange}
                    isPlaying={isPlaying}
                    zoom={zoom}
                  />
                  <Playhead/>

                  {!isLoop && (
                    <ProjectEndOverlay 
                      containerRef={tracksAndTimelineRef}
                      duration={duration}
                      canEdit={!isProjectMode || canEditProject}
                    />
                  )}
                  
                </div>
              </>
            )}
          </div>
          </div>
          {tracks.length > 0 && zoom > 1 && (
            <div className={styles.zoomIndicator}>
              Zoom: {zoom.toFixed(1)}x
            </div>
          )}
          <ZoomSlider
              zoom={zoom}
              onZoomChange={setZoomLevel}
            />
          </div>
          {isProjectEditor && <ProjectFilesPanel />}
        </div>
      </div>

      <ContextMenu
        x={contextMenuPosition.x}
        y={contextMenuPosition.y}
        show={showContextMenu}
        items={contextMenuItems}
        onClose={() => setShowContextMenu(false)}
      />

      {!isProjectMode && recordingTrackHasAudio && showUploadForm && (
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
function DAW({ track, isVisible = true }) {
  // Convert track data to the format expected by DAWContext
  // Use useMemo to stabilize the reference and prevent unnecessary re-initializations
  const trackData = useMemo(() => track ? [track] : [], [track]);
  const isCollab = track ? true : false;

  return (
    <DAWProvider trackData={trackData} isCollab={isCollab}>
      <DAWWrapper track={track} isVisible={isVisible} />
    </DAWProvider>
  );
}

function ProjectDAW({ project, isVisible = true, onProjectChange }) {
  const projectData = useMemo(
    () => project,
    [project?.guid, project?.revision, project?.updatedAt]
  );

  return (
    <DAWProvider mode="project" projectData={projectData}>
      <ProjectEditorProvider
        projectData={projectData}
        onProjectStateChange={onProjectChange}
      >
        <DAWWrapper isVisible={isVisible} />
      </ProjectEditorProvider>
    </DAWProvider>
  );
}

// Wrapper component that handles fullscreen modal rendering
function DAWWrapper({ track, isVisible = true }) {
  const { isFullscreen } = useDAW();

  if (isFullscreen) {
    return (
      <>
        {/* Fullscreen modal overlay */}
        <div className={styles.fullscreenOverlay}>
          <DAWContent track={track} isVisible={isVisible} />
        </div>
      </>
    );
  }

  return <DAWContent track={track} isVisible={isVisible} />;
}

export { ProjectDAW };
export default DAW;