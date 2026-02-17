'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import LoopListeningEngine from './LoopListeningEngine';
import { eventBus } from '../../components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '../../components/DAW/misc/DAWEvents.js';

const LoopListeningContext = createContext();

export function LoopListeningProvider({ children, rootTrack }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isCycleMode, setIsCycleMode] = useState(false);
  const [loopDuration, setLoopDuration] = useState(null);
  
  // Queues
  const automaticQueueRef = useRef([]); // History queue (tracks remain after playing)
  const manualQueueRef = useRef([]); // User-queued tracks (removed when played)
  const playedTracksRef = useRef(new Set()); // Track which tracks have been played
  
  // Engine and audio context
  const engineRef = useRef(null);
  const audioContextRef = useRef(null);
  
  // Track end callback (for tree page)
  const onTrackEndCallbackRef = useRef(null);
  
  // Previous track threshold (same as global player)
  const PREVIOUS_THRESHOLD = 2; // seconds

  let queueIndex = 0;

  const getNextTrack = () => {
    // Check manual queue first
    if (manualQueueRef.current.length > 0) {
      const nextTrack = manualQueueRef.current[0];
      manualQueueRef.current = manualQueueRef.current.slice(1); // Remove from queue
      return nextTrack;
    }
    
    // Check automatic queue
    if (automaticQueueRef.current.length > 0) {
      // Find next track in automatic queue (after current)
      
      if (queueIndex >= 0 && queueIndex < automaticQueueRef.current.length - 1) {
        queueIndex++;
        return automaticQueueRef.current[queueIndex];
      }
    }
  return null;
}
  
  // Initialize audio context and engine
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (!engineRef.current) {
      engineRef.current = new LoopListeningEngine(audioContextRef.current, getNextTrack);
    }
    
    // Set loop duration from root track if available
    if (rootTrack && rootTrack.duration) {
      const duration = rootTrack.duration;
      engineRef.current.setLoopDuration(duration);
      setLoopDuration(duration);
    }
    
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [rootTrack]);
  
  /**
   * Play a track (starts loop mode)
   */
  const playTrack = useCallback(async (track) => {
    if (!track || !engineRef.current) return;
    
    // Clear automatic queue and add this track
    automaticQueueRef.current = [track];
    queueIndex = 0;
    playedTracksRef.current.clear();
    
    // Get loop duration from root track or use track duration
    let duration = loopDuration;
    if (!duration && rootTrack?.duration) {
      duration = rootTrack.duration;
      engineRef.current.setLoopDuration(duration);
      setLoopDuration(duration);
    }
    
    // Play the track (events will update state)
    await engineRef.current.playTrack(track, duration);
  }, [loopDuration, rootTrack]);
  
  /**
   * Queue a track (adds to manual queue)
   */
  const queueTrack = useCallback((track) => {
    if (!track) return;
    
    // Add to manual queue
    manualQueueRef.current = [...manualQueueRef.current, track];
  }, []);

  /**
   * Play next track
   */
  const playNext = useCallback(async () => {
    if (!engineRef.current) return;
    
    await engineRef.current.next();
    
  }, [currentTrack]);
  
  /**
   * Play previous track
   */
  const playPrevious = useCallback(async () => {
    if (!engineRef.current || !currentTrack) return;
    
    // Check if we should restart current track (threshold check)
    const currentProgress = engineRef.current.getProgress();
    
    if (currentProgress > PREVIOUS_THRESHOLD) {
      // Restart current track
      await seek(0);
      return;
    }
    
    if (queueIndex > 0) {
      queueIndex--;
      const prevTrack = automaticQueueRef.current[queueIndex];
      // Play the track (events will update state)
      await engineRef.current.playTrack(prevTrack);
    } else {
      // No previous track - restart current
      await seek(0);
    }
  }, [currentTrack]);
  
  /**
   * Toggle play/pause
   */
  const togglePlayPause = useCallback(async () => {
    if (!engineRef.current) return;
    
    if (isPlaying) {
      engineRef.current.pause();
      // State will be updated via event
    } else {
      if (currentTrack) {
        await engineRef.current.resume();
        // State will be updated via event
      }
    }
  }, [isPlaying, currentTrack]);
  
  /**
   * Seek within current loop
   */
  const seek = useCallback(async (position) => {
    if (!engineRef.current) return;
    
    await engineRef.current.seek(position);
    // Progress will be updated via event
  }, []);
  
  /**
   * Toggle cycle mode
   */
  const toggleCycle = useCallback(() => {
    if (!engineRef.current) return;
    
    if (isCycleMode) {
      engineRef.current.disableCycleMode();
    } else {
      engineRef.current.enableCycleMode();
    }
    // State will be updated via event
  }, [isCycleMode]);
  
  /**
   * Stop playback
   */
  const stop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    // State will be updated via event
  }, []);
  
  /**
   * Set track end callback (for tree page)
   */
  const setOnTrackEnd = useCallback((callback) => {
    onTrackEndCallbackRef.current = callback;
  }, []);
  
  /**
   * Add tracks to automatic queue (for tree traversal)
   */
  const addToAutomaticQueue = useCallback((tracks) => {
    automaticQueueRef.current = [...automaticQueueRef.current, ...tracks];
  }, []);
  
  /**
   * Set loop duration (for future variable loop length support)
   */
  const setLoopDurationValue = useCallback((duration) => {
    if (engineRef.current) {
      engineRef.current.setLoopDuration(duration);
      setLoopDuration(duration);
    }
  }, []);

  // Set up event listeners for state synchronization (after all callbacks are defined)
  useEffect(() => {
    // Handle track started
    const handleTrackStarted = (data) => {
      setCurrentTrack(data.track);
      setIsPlaying(true);
    };

    // Handle track changed
    const handleTrackChanged = (data) => {
      setCurrentTrack(data.track);
    };

    // Handle track ended
    const handleTrackEnded = (data) => {
      const track = data.track;
      
      // Add to played tracks
      playedTracksRef.current.add(track.id);
      
      // Call tree page callback if set
      if (onTrackEndCallbackRef.current) {
        onTrackEndCallbackRef.current();
      }
      
      // Move to next track
      //playNext();
    };

    // Handle playback started
    const handlePlaybackStarted = (data) => {
      setIsPlaying(true);
    };

    // Handle playback stopped
    const handlePlaybackStopped = () => {
      setIsPlaying(false);
      setCurrentTrack(null);
      setProgress(0);
    };

    // Handle playback paused
    const handlePlaybackPaused = () => {
      setIsPlaying(false);
    };

    // Handle progress update
    const handleProgressUpdate = (data) => {
      setProgress(data.progress);
    };

    // Handle cycle mode changed
    const handleCycleModeChanged = (data) => {
      setIsCycleMode(data.enabled);
    };

    // Handle loop duration changed
    const handleLoopDurationChanged = (data) => {
      setLoopDuration(data.duration);
    };

    // Handle seek
    const handleSeek = (data) => {
      setProgress(data.position);
    };

    // Register event listeners
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, handleTrackStarted);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, handleTrackChanged);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, handleTrackEnded);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, handlePlaybackStarted);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STOPPED, handlePlaybackStopped);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_PAUSED, handlePlaybackPaused);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PROGRESS_UPDATE, handleProgressUpdate);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, handleCycleModeChanged);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.LOOP_DURATION_CHANGED, handleLoopDurationChanged);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.SEEK, handleSeek);

    // Cleanup: remove event listeners
    return () => {
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, handleTrackStarted);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, handleTrackChanged);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, handleTrackEnded);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, handlePlaybackStarted);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STOPPED, handlePlaybackStopped);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_PAUSED, handlePlaybackPaused);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PROGRESS_UPDATE, handleProgressUpdate);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, handleCycleModeChanged);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.LOOP_DURATION_CHANGED, handleLoopDurationChanged);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.SEEK, handleSeek);
    };
  }, [playNext, stop]);

  return (
    <LoopListeningContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        isCycleMode,
        loopDuration,
        playTrack,
        queueTrack,
        togglePlayPause,
        playNext,
        playPrevious,
        seek,
        toggleCycle,
        stop,
        setOnTrackEnd,
        addToAutomaticQueue,
        setLoopDuration: setLoopDurationValue,
      }}
    >
      {children}
    </LoopListeningContext.Provider>
  );
}

export function useLoopListening() {
  const context = useContext(LoopListeningContext);
  if (!context) {
    throw new Error('useLoopListening must be used within LoopListeningProvider');
  }
  return context;
}

