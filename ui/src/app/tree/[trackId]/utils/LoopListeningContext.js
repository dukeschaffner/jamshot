'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import LoopListeningEngine from './LoopListeningEngine';
import { eventBus } from '../../../../components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '../../../../components/DAW/misc/DAWEvents.js';
import { getAudioBufferFromS3 } from '../../../../components/DAW/misc/DAWUtils.js';
import { bufferRegistry } from '../../../../components/DAW/core/BufferRegistry.js';
import api from '../../../../lib/api';

const LoopListeningContext = createContext();

export function LoopListeningProvider({ children, rootTrack, treeDataManager }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isCycleMode, setIsCycleMode] = useState(false);
  const [loopDuration, setLoopDuration] = useState(null);
  const [playedTracks, setPlayedTracks] = useState(new Set()); // Track which tracks have been played
  const [trackPath, setTrackPath] = useState([]); // Array of track IDs from root to current track
  
  // Queues
  const automaticQueueRef = useRef([]); // History queue (tracks remain after playing)
  const manualQueueRef = useRef([]); // User-queued tracks (removed when played)
  const playedTracksRef = useRef(new Set()); // Track which tracks have been played (for internal use)
  
  // Engine and audio context
  const engineRef = useRef(null);
  const audioContextRef = useRef(null);
  
  // Track end callback (for tree page)
  const onTrackEndCallbackRef = useRef(null);
  
  // Current track ref (to avoid stale closures in getNextTrack)
  const currentTrackRef = useRef(null);
  
  // Previous track threshold (same as global player)
  const PREVIOUS_THRESHOLD = 2; // seconds

  const queueIndex = useRef(0);

  // Refs for play counter and analytics
  const listeningTimeRef = useRef(0);
  const playRecordedRef = useRef(false);
  const playIdRef = useRef(null);
  const thresholdRef = useRef(0); // threshold for recording initial play
  const discoveryMethodRef = useRef('tree_page');

  // Used for counting plays
  const updateListeningTime = useCallback(() => {
    if (isPlaying && engineRef.current) {
      listeningTimeRef.current += 1; // Add one second
      console.log('listening time', listeningTimeRef.current);
    }
  }, [isPlaying]);

  // Check and record initial play based on listening criteria
  const checkAndRecordPlay = useCallback(() => {
    if (!currentTrack || playRecordedRef.current) return;
    
    // Use loop duration as track duration for threshold calculation
    const duration = loopDuration || currentTrack.duration || 0;
    thresholdRef.current = duration < 30 ? duration * 0.9 : 30;
    
    // Record initial play if:
    // 1. User listened to at least 30 seconds, OR
    // 2. For tracks < 30 seconds, user listened to at least 90% of the track
    if (listeningTimeRef.current >= thresholdRef.current) {
      recordInitialPlay();
    }
  }, [currentTrack, loopDuration]);

  // Record initial play via API
  const recordInitialPlay = useCallback(async () => {
    if (!currentTrack || playRecordedRef.current) return;
    
    // Set flag first to prevent retries even if the request fails
    playRecordedRef.current = true;
    
    try {
      // Get referrer URL for discovery method
      const referrerUrl = typeof document !== 'undefined' ? (document.referrer || null) : null;
      
      const response = await api.post(`/tracks/${currentTrack.id}/play`, {
        discovery_method: discoveryMethodRef.current,
        referrer_url: referrerUrl
      });
      
      if (response?.data?.play_id) {
        playIdRef.current = response.data.play_id;
      }
    } catch (err) {
      console.error('Failed to record initial play:', err);
      // Don't reset the flag - prevent retries on failure
    }
  }, [currentTrack]);

  // Update play with final analytics data
  const updatePlay = useCallback(async (skipped = false, track = null) => {
    const trackToUpdate = track || currentTrack;
    if (!trackToUpdate) return;
    if (listeningTimeRef.current < thresholdRef.current) return;
    if(!playIdRef.current) return;
    
    try {
      // Calculate final analytics data
      const listenDuration = listeningTimeRef.current;
      const trackDuration = loopDuration || trackToUpdate.duration || 0;
      const isCompletePlay = listenDuration >= trackDuration * 0.98;

      let skipTime = null;
      if (skipped && engineRef.current) {
        skipTime = engineRef.current.getProgress();
      }

      await api.post(`/tracks/${trackToUpdate.id}/play`, {
        listen_duration: listenDuration,
        is_complete_play: isCompletePlay,
        skip_time: skipTime,
        play_id: playIdRef.current
      }).catch(err => {
        console.error('Failed to update play:', err);
      });
    } catch (err) {
      console.error('Failed to update play:', err);
    }
  }, [currentTrack, loopDuration]);

  const getNextTrack = async () => {
    // Check manual queue first
    if (manualQueueRef.current.length > 0) {
      return manualQueueRef.current[0];
    }
    
    // Check automatic queue
    if (automaticQueueRef.current.length > 0) {
      // Find next track in automatic queue (after current)
      if (queueIndex.current >= 0 && queueIndex.current < automaticQueueRef.current.length - 1) {
        queueIndex.current++;
        return automaticQueueRef.current[queueIndex.current];
      }
    }
    // Get next track from tree data manager
    if (treeDataManager && currentTrackRef.current) {
      try {
        const nextTrackId = await treeDataManager.getNextTrack(currentTrackRef.current.id);
        if (nextTrackId && treeDataManager.trackData.has(nextTrackId)) {
          const nextTrack = treeDataManager.trackData.get(nextTrackId);
          // Add to automatic queue
          automaticQueueRef.current = [...automaticQueueRef.current, nextTrack];
          queueIndex.current = automaticQueueRef.current.length - 1;
          return nextTrack;
        }
      } catch (error) {
        console.error('Error getting next track from tree data manager:', error);
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
    
    // Decode root track audio and set loop duration from decoded buffer
    if (rootTrack) {
      const audioUrl = rootTrack.combined_audio_url || rootTrack.audio_url;
      if (audioUrl && audioContextRef.current) {
        const bufferKey = `${rootTrack.id}_root-loop`;
        
        // Check if buffer is already in registry
        if (bufferRegistry.hasBuffer(bufferKey)) {
          const buffer = bufferRegistry.getBuffer(bufferKey);
          const duration = buffer.duration;
          if (engineRef.current) {
            engineRef.current.setLoopDuration(duration);
            setLoopDuration(duration);
          }
        } else {
          // Decode and store in registry
          getAudioBufferFromS3(audioUrl, audioContextRef.current)
            .then((buffer) => {
              // Store buffer in registry
              bufferRegistry.storeBuffer(bufferKey, buffer, {
                name: 'root-loop',
                trackId: rootTrack.id
              });
              
              const duration = buffer.duration;
              if (engineRef.current) {
                engineRef.current.setLoopDuration(duration);
                setLoopDuration(duration);
              }
            })
            .catch((error) => {
              console.error('Error decoding root track audio:', error);
              // Fallback to track duration if available
              if (rootTrack.duration) {
                const duration = rootTrack.duration;
                engineRef.current.setLoopDuration(duration);
                setLoopDuration(duration);
              }
            });
        }
      } else if (rootTrack.duration) {
        // Fallback to track duration if no audio URL
        const duration = rootTrack.duration;
        engineRef.current.setLoopDuration(duration);
        setLoopDuration(duration);
      }
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
    queueIndex.current = 0;
    playedTracksRef.current.clear();
    setPlayedTracks(new Set()); // Clear state as well
    currentTrackRef.current = track;
    setCurrentTrack(track);
    
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

    // if no next track is set, set the next track to the queued track
    if(!engineRef.current.hasNextTrack()) {
      engineRef.current.setNextTrack(track);
    }
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
    
    if (queueIndex.current > 0) {
      queueIndex.current--;
      const prevTrack = automaticQueueRef.current[queueIndex.current];
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

  /**
   * Function to set discovery method for analytics
   */
  const setDiscoveryMethod = useCallback((method) => {
    discoveryMethodRef.current = method;
  }, []);

  // Set up event listeners for state synchronization (after all callbacks are defined)
  useEffect(() => {
    // Handle track started
    const handleTrackStarted = (data) => {
      setCurrentTrack(data.track);
      currentTrackRef.current = data.track;
      setIsPlaying(true);
      
      // Update track path when track changes
      if (treeDataManager && data.track?.id) {
        const path = treeDataManager.getTrackPath(data.track.id);
        setTrackPath(path);
      }
    };

    // Handle track changed
    const handleTrackChanged = (data) => {
      // Update play analytics for previous track before changing
      if (data.previousTrack) {
        updatePlay(true, data.previousTrack);
      }
      
      setCurrentTrack(data.track);
      currentTrackRef.current = data.track;

      // if previous track came from manual queue, remove it from the queue
      if (manualQueueRef.current[0]?.id === data.previousTrack?.id) {
        manualQueueRef.current = manualQueueRef.current.slice(1); // Remove from queue
      }

      // Update track path when track changes
      if (treeDataManager && data.track?.id) {
        const path = treeDataManager.getTrackPath(data.track.id);
        setTrackPath(path);
      }
    };

    // Handle track ended
    const handleTrackEnded = (data) => {
      const track = data.track;
      
      // Add to played tracks
      playedTracksRef.current.add(track.id);
      setPlayedTracks(new Set(playedTracksRef.current)); // Update state
      
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
      currentTrackRef.current = null;
      setTrackPath([]);
    };

    // Handle playback paused
    const handlePlaybackPaused = () => {
      setIsPlaying(false);
    };

    // Handle cycle mode changed
    const handleCycleModeChanged = (data) => {
      setIsCycleMode(data.enabled);
    };

    // Handle loop duration changed
    const handleLoopDurationChanged = (data) => {
      setLoopDuration(data.duration);
    };


    // Register event listeners
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, handleTrackStarted);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, handleTrackChanged);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, handleTrackEnded);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, handlePlaybackStarted);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STOPPED, handlePlaybackStopped);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_PAUSED, handlePlaybackPaused);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, handleCycleModeChanged);
    eventBus.on(DAW_EVENTS.LOOP_LISTENING.LOOP_DURATION_CHANGED, handleLoopDurationChanged);

    // Cleanup: remove event listeners
    return () => {
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, handleTrackStarted);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, handleTrackChanged);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, handleTrackEnded);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, handlePlaybackStarted);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STOPPED, handlePlaybackStopped);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.PLAYBACK_PAUSED, handlePlaybackPaused);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, handleCycleModeChanged);
      eventBus.off(DAW_EVENTS.LOOP_LISTENING.LOOP_DURATION_CHANGED, handleLoopDurationChanged);
    };
  }, [playNext, stop, updatePlay]);

  // Interval to check for play recording and track analytics
  useEffect(() => {
    if (!currentTrack) return;
    
    // Reset analytics state for new track
    listeningTimeRef.current = 0;
    playRecordedRef.current = false;
    playIdRef.current = null;
    
    // Set up interval to track listening time and check for play recording
    const interval = setInterval(() => {
      updateListeningTime();
      checkAndRecordPlay();
    }, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [currentTrack, updateListeningTime, checkAndRecordPlay]);

  return (
    <LoopListeningContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isCycleMode,
        loopDuration,
        playedTracks,
        trackPath,
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
        setDiscoveryMethod,
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

