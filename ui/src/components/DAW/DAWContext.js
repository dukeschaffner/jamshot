// ui/src/contexts/DAWContext.js
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import TrackManager from './core/TrackManager';
import AudioEngine from './core/AudioEngine';
import { eventBus } from './misc/EventBus';
import { DAW_EVENTS } from './misc/DAWEvents';

const DAWContext = createContext();

export function DAWProvider({ children, trackData }) {
    const trackManagerRef = useRef(null);
    const audioEngineRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [playheadLocation, setPlayheadLocation] = useState({time: 0});
    const [metronomeBpm, setMetronomeBpm] = useState(120);
    const [timeSignature, setTimeSignature] = useState('4/4');
    const [metronomeOffset, setMetronomeOffset] = useState(0);
    const [duration, setDuration] = useState(0);
    const [tracks, setTracks] = useState([]);
    const [zoom, setZoom] = useState(1);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [tracksContainerWidth, setTracksContainerWidth] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const playRecordedRef = useRef(false);
  const durationRef = useRef(0);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  
  useEffect(() => {
    const initializeDAW = async () => {
      try {
        setIsLoading(true);
        
        // Clean up existing instances first
        if (audioEngineRef.current) {
          audioEngineRef.current.destroy();
          audioEngineRef.current = null;
        }
        if (trackManagerRef.current) {
          trackManagerRef.current.destroy();
          trackManagerRef.current = null;
        }
        
        // Initialize audio context
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create and load all tracks
        const tm = new TrackManager(audioContext);
        
        // Load existing tracks if provided
        if (trackData && trackData.length > 0) {
          await tm.loadAllTracks(trackData);
        }
        
        // Always create an empty track for recording
        tm.createEmptyTrack('recording-track');
        
        // Initialize audio engine
        const ae = new AudioEngine(audioContext);
        await ae.initialize(tm);
        
        trackManagerRef.current = tm;
        audioEngineRef.current = ae;
        setTracks(tm.getAllTracks());
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Initialize DAW even if no trackData is provided
    initializeDAW();
  }, [trackData]);

  useEffect(() => {
    if (tracks.length > 0) {
      const trackDuration = tracks[0].duration;
      // Set a default duration of 90 seconds for empty tracks or tracks with 0 duration
      setDuration(trackDuration > 0 ? trackDuration : 90);
    } else {
      // Default duration when no tracks exist
      setDuration(90);
    }
  }, [tracks]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (audioEngineRef.current) {
        audioEngineRef.current.destroy();
      }
      if (trackManagerRef.current) {
        trackManagerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    // Listen for transport events
    const handlePlaybackStarted = () => {
      setIsPlaying(true);
    };
    
    const handlePlaybackStopped = () => {
      setIsPlaying(false);
    };
    
    const handlePlaybackPaused = () => {
      setIsPlaying(false);
    };
    
    const handlePositionUpdate = (data) => {
      setPlayheadLocation(data);
    };
    
    // Listen for recording events
    const handleRecordingStarted = () => {
      setIsRecording(true);
    };
    
    const handleRecordingStopped = (data) => {
      setIsRecording(false);
      console.log('Recording stopped');

      const track = trackManagerRef.current.getTrack('recording-track');
      track.addRegion(data.bufferKey, data.startTime, data.offset, null, '', true);
    };
    
    const handleRecordingError = (error) => {
      console.error('Recording error:', error);
      setIsRecording(false);
    };

    const handleBpmChange = (data) => {
      const newBpm = data.bpm;
      console.log('BPM changed to:', newBpm);
      setMetronomeBpm(newBpm);
    };
    
    const handleTimeSignatureChange = (data) => {
      const newTimeSignature = data.timeSignature;
      console.log('Time signature changed to:', newTimeSignature);
      setTimeSignature(newTimeSignature);
    };

    const handleMetronomeOffsetChange = (data) => {
      const newOffset = data.offset;
      setMetronomeOffset(newOffset);
    };
    
    const handleSeek = (data) => {
      const position = (data.time / durationRef.current) * 100;
      setPlayheadLocation({time: data.time, position: position});
    };
    
    // Register event listeners
    eventBus.on(DAW_EVENTS.PLAYBACK.STARTED, handlePlaybackStarted);
    eventBus.on(DAW_EVENTS.PLAYBACK.STOPPED, handlePlaybackStopped);
    eventBus.on(DAW_EVENTS.PLAYBACK.PAUSED, handlePlaybackPaused);
    eventBus.on(DAW_EVENTS.PLAYBACK.POSITION_UPDATE, handlePositionUpdate);
    eventBus.on(DAW_EVENTS.RECORDING.STARTED, handleRecordingStarted);
    eventBus.on(DAW_EVENTS.RECORDING.STOPPED, handleRecordingStopped);
    eventBus.on(DAW_EVENTS.RECORDING.ERROR, handleRecordingError);
    eventBus.on(DAW_EVENTS.METRONOME.BPM_CHANGE, handleBpmChange);
    eventBus.on(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, handleTimeSignatureChange);
    eventBus.on(DAW_EVENTS.METRONOME.OFFSET_CHANGE, handleMetronomeOffsetChange);
    eventBus.on(DAW_EVENTS.TRANSPORT.SEEK, handleSeek);
    // Return cleanup function
    return () => {
      eventBus.off(DAW_EVENTS.PLAYBACK.STARTED, handlePlaybackStarted);
      eventBus.off(DAW_EVENTS.PLAYBACK.STOPPED, handlePlaybackStopped);
      eventBus.off(DAW_EVENTS.PLAYBACK.PAUSED, handlePlaybackPaused);
      eventBus.off(DAW_EVENTS.PLAYBACK.POSITION_UPDATE, handlePositionUpdate);
      eventBus.off(DAW_EVENTS.RECORDING.STARTED, handleRecordingStarted);
      eventBus.off(DAW_EVENTS.RECORDING.STOPPED, handleRecordingStopped);
      eventBus.off(DAW_EVENTS.RECORDING.ERROR, handleRecordingError);
      eventBus.off(DAW_EVENTS.METRONOME.BPM_CHANGE, handleBpmChange);
      eventBus.off(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, handleTimeSignatureChange);
      eventBus.off(DAW_EVENTS.METRONOME.OFFSET_CHANGE, handleMetronomeOffsetChange);
      eventBus.off(DAW_EVENTS.TRANSPORT.SEEK, handleSeek);
    };
  }, []); 

  const recordPlay = async () => {
    if (!track || playRecordedRef.current) return;
    
    try {
      playRecordedRef.current = true;
      
      // Get referrer URL for discovery method
      const referrerUrl = document.referrer || null;
      
      const response = await api.post(`/tracks/${track.id}/play`, {
        discovery_method: 'track_page',
        referrer_url: referrerUrl
      });
      
      console.log('Play recorded for track:', track.id);
    } catch (err) {
      console.error('Failed to record initial play:', err);
    }
  };
  
  // Zoom control functions
  const setZoomLevel = (newZoom) => {
    const clampedZoom = Math.max(0.1, Math.min(10, newZoom));
    setZoom(clampedZoom);
    eventBus.emit(DAW_EVENTS.UI.ZOOM_CHANGE, { zoom: clampedZoom });
  };

  const setScrollLeftValue = (newOffset) => {
    setScrollLeft(newOffset);
    eventBus.emit(DAW_EVENTS.UI.VIEW_CHANGE, { scrollLeft: newOffset });
  };

  return (
    <DAWContext.Provider value={{
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
      setMetronomeOffset,
      duration,
      zoom,
      scrollLeft,
      setZoomLevel,
      setScrollLeftValue,
      tracksContainerWidth,
      setTracksContainerWidth,
    }}>
      {children}
    </DAWContext.Provider>
  );
}

export const useDAW = () => useContext(DAWContext);