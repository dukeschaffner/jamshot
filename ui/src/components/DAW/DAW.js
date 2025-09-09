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
  } = useDAW();

  const saved = useRef(false);

  useNavigationGuard({ 
    enabled: !!recordingTrackHasAudio && !saved.current, 
    confirm: () => window.confirm("You have unsaved recordings. Are you sure you want to leave? Your recordings will be lost.") 
  });

  const tracksAndTimelineRef = useRef(null);
  const tracksScrollContainerRef = useRef(null);
  const [tracksContainer, setTracksContainer] = useState(null);

  const [showUploadForm, setShowUploadForm] = useState(false);


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
      // Handle 'r' key for recording
      else if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (isRecording) {
          // Stop recording if currently recording
          eventBus.emit(DAW_EVENTS.RECORDING.STOP);
        } else {
          // Start recording if not currently recording
          eventBus.emit(DAW_EVENTS.RECORDING.START);
        }
      }
    };

    // Add event listener to the window
    window.addEventListener('keydown', handleKeyDown);

    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, isRecording]); // Include dependencies

  const handleTimelineClick = (e) => {
    e.stopPropagation();
    if (isRecording) return;
    const rect = tracksAndTimelineRef.current.getBoundingClientRect();
    const time = (e.clientX - rect.left) / rect.width * duration;
    eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: time });
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
              <TrackHeader key={index} track={track}/>
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
                  
                  {/* Project End Overlay - only show in collaboration mode */}
                  {!isCollab && (
                    <ProjectEndOverlay 
                      containerRef={tracksAndTimelineRef}
                      duration={duration}
                      zoom={zoom}
                    />
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
          {/* Takes Component */}
          <Takes />
        </div>
      </div>

      {recordingTrackHasAudio && showUploadForm && (
        <UploadForm 
          isCollab={isCollab}
          onCancel={() => {
            setShowUploadForm(false);
          }}
          onUploadComplete={() => {
            console.log("Upload completed successfully!");
            saved.current = true;
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