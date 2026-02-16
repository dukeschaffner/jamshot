'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import LoopListeningEngine from './LoopListeningEngine';

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
  
  // Initialize audio context and engine
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (!engineRef.current) {
      engineRef.current = new LoopListeningEngine(audioContextRef.current);
      
      // Set callbacks
      engineRef.current.setCallbacks({
        onTrackEnd: handleTrackEnd,
        onProgressUpdate: (progress) => {
          setProgress(progress);
        }
      });
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
   * Handle track end
   */
  const handleTrackEnd = useCallback((track) => {
    // Add to played tracks
    playedTracksRef.current.add(track.id);
    
    // Call tree page callback if set
    if (onTrackEndCallbackRef.current) {
      onTrackEndCallbackRef.current();
    }
    
    // Move to next track
    playNext();
  }, []);
  
  /**
   * Play a track (starts loop mode)
   */
  const playTrack = useCallback(async (track) => {
    if (!track || !engineRef.current) return;
    
    // Clear automatic queue and add this track
    automaticQueueRef.current = [track];
    playedTracksRef.current.clear();
    
    // Set as current track
    setCurrentTrack(track);
    setIsPlaying(true);
    
    // Get loop duration from root track or use track duration
    let duration = loopDuration;
    if (!duration && rootTrack?.duration) {
      duration = rootTrack.duration;
      engineRef.current.setLoopDuration(duration);
      setLoopDuration(duration);
    }
    
    // Play the track
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
    
    // Check manual queue first
    if (manualQueueRef.current.length > 0) {
      const nextTrack = manualQueueRef.current[0];
      manualQueueRef.current = manualQueueRef.current.slice(1); // Remove from queue
      
      setCurrentTrack(nextTrack);
      setIsPlaying(true);
      
      await engineRef.current.playTrack(nextTrack);
      return;
    }
    
    // Check automatic queue
    if (automaticQueueRef.current.length > 0) {
      // Find next track in automatic queue (after current)
      const currentIndex = automaticQueueRef.current.findIndex(
        t => t.id === currentTrack?.id
      );
      
      if (currentIndex >= 0 && currentIndex < automaticQueueRef.current.length - 1) {
        const nextTrack = automaticQueueRef.current[currentIndex + 1];
        setCurrentTrack(nextTrack);
        setIsPlaying(true);
        await engineRef.current.playTrack(nextTrack);
        return;
      }
    }
    
    // No more tracks - stop playback
    stop();
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
    
    // Find previous track in automatic queue
    const currentIndex = automaticQueueRef.current.findIndex(
      t => t.id === currentTrack.id
    );
    
    if (currentIndex > 0) {
      const prevTrack = automaticQueueRef.current[currentIndex - 1];
      setCurrentTrack(prevTrack);
      setIsPlaying(true);
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
      setIsPlaying(false);
    } else {
      if (currentTrack) {
        await engineRef.current.resume();
        setIsPlaying(true);
      }
    }
  }, [isPlaying, currentTrack]);
  
  /**
   * Seek within current loop
   */
  const seek = useCallback(async (position) => {
    if (!engineRef.current) return;
    
    await engineRef.current.seek(position);
    setProgress(position);
  }, []);
  
  /**
   * Toggle cycle mode
   */
  const toggleCycle = useCallback(() => {
    if (!engineRef.current) return;
    
    const newCycleMode = !isCycleMode;
    setIsCycleMode(newCycleMode);
    
    if (newCycleMode) {
      engineRef.current.enableCycleMode();
    } else {
      engineRef.current.disableCycleMode();
    }
  }, [isCycleMode]);
  
  /**
   * Stop playback
   */
  const stop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setIsPlaying(false);
    setCurrentTrack(null);
    setProgress(0);
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

