'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import LoopListeningEngine from './LoopListeningEngine';
import StandardPlaybackEngine from './StandardPlaybackEngine';
import { eventBus } from '../../../../components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '../../../../components/DAW/misc/DAWEvents.js';
import { getAudioBufferFromS3 } from '../../../../components/DAW/misc/DAWUtils.js';
import { bufferRegistry } from '../../../../components/DAW/core/BufferRegistry.js';
import api from '../../../../lib/api';
import { loopLog, loopWarn, loopError } from './loopListeningLog.js';

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

  const queueIndex = useRef(0); // Index of the current track (if current track is from the automatic queue, otherwise the index of the last played track from the automatic queue)
  const nextTrackIsFromAutomaticQueue = useRef(false); // Whether the next track is from the automatic queue

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
    loopLog('context.getNextTrack', 'Resolving next track', {
      manualQueueLength: manualQueueRef.current.length,
      automaticQueueLength: automaticQueueRef.current.length,
      queueIndex: queueIndex.current,
      currentTrackId: currentTrackRef.current?.id ?? null,
    });

    // Check manual queue first
    if (manualQueueRef.current.length > 0) {
      nextTrackIsFromAutomaticQueue.current = false;
      const track = manualQueueRef.current[0];
      loopLog('context.getNextTrack', 'Using manual queue head', { trackId: track?.id ?? null });
      return track;
    }
    
    // Check automatic queue
    if (automaticQueueRef.current.length > 0) {
      // Find next track in automatic queue (after current)
      if (queueIndex.current >= 0 && queueIndex.current < automaticQueueRef.current.length - 1) {
        nextTrackIsFromAutomaticQueue.current = true;
        const track = automaticQueueRef.current[queueIndex.current + 1];
        loopLog('context.getNextTrack', 'Using next automatic queue track', {
          trackId: track?.id ?? null,
          queueIndex: queueIndex.current + 1,
        });
        return track;
      }
    }
    // Get next track from tree data manager
    if (treeDataManager && currentTrackRef.current) {
      try {
        const lastAutomaticQueueIndex = Math.max(0, automaticQueueRef.current.length - 1);
        const lastAutomaticQueueTrack = automaticQueueRef.current[lastAutomaticQueueIndex];
        const nextTrackId = await treeDataManager.getNextTrack(lastAutomaticQueueTrack.id);
        if (nextTrackId && treeDataManager.trackData.has(nextTrackId)) {
          const nextTrack = treeDataManager.trackData.get(nextTrackId);
          // Add to automatic queue
          automaticQueueRef.current = [...automaticQueueRef.current, nextTrack];
          nextTrackIsFromAutomaticQueue.current = true;
          loopLog('context.getNextTrack', 'Fetched next track from tree', { trackId: nextTrack.id });
          return nextTrack;
        }
        loopWarn('context.getNextTrack', 'Tree returned no next track', {
          fromTrackId: lastAutomaticQueueTrack?.id ?? null,
          nextTrackId,
        });
      } catch (error) {
        loopError('context.getNextTrack', 'Tree lookup failed', {
          error: error?.message ?? String(error),
        });
      }
    } else {
      loopWarn('context.getNextTrack', 'Cannot query tree', {
        hasTreeDataManager: Boolean(treeDataManager),
        currentTrackId: currentTrackRef.current?.id ?? null,
      });
    }
    loopWarn('context.getNextTrack', 'No next track found');
    return null;
  }
  
  // Initialize audio context and engine
  useEffect(() => {
    loopLog('context.init', 'Provider init effect running', {
      rootTrackId: rootTrack?.id ?? null,
      rootIsLoop: rootTrack?.is_loop ?? false,
      hasCombinedAudioUrl: Boolean(rootTrack?.combined_audio_url),
      hasAudioUrl: Boolean(rootTrack?.audio_url),
      rootDuration: rootTrack?.duration ?? null,
    });
    
    // Decode root track audio and set loop duration from decoded buffer
    if (rootTrack) {
      if(rootTrack.is_loop) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          loopLog('context.init', 'Created AudioContext for loop mode', {
            audioContextState: audioContextRef.current.state,
            sampleRate: audioContextRef.current.sampleRate,
          });
        }
        
        if (!engineRef.current) {
          engineRef.current = new LoopListeningEngine(audioContextRef.current, getNextTrack);
          loopLog('context.init', 'Created LoopListeningEngine');
        }
      }
      else{
        if (!engineRef.current) {
          engineRef.current = new StandardPlaybackEngine(getNextTrack);
          loopLog('context.init', 'Created StandardPlaybackEngine (root is not loop)');
        }
      }
      const audioUrl = rootTrack.combined_audio_url || rootTrack.audio_url;
      if (audioUrl && audioContextRef.current) {
        const bufferKey = `${rootTrack.id}_root-loop`;
        
        // Check if buffer is already in registry
        if (bufferRegistry.hasBuffer(bufferKey)) {
          const buffer = bufferRegistry.getBuffer(bufferKey);
          const duration = buffer.duration;
          loopLog('context.init', 'Root loop buffer cache hit', {
            rootTrackId: rootTrack.id,
            duration,
          });
          if (engineRef.current && engineRef.current instanceof LoopListeningEngine) {
            engineRef.current.setLoopDuration(duration);
            setLoopDuration(duration);
          }
        } else {
          loopLog('context.init', 'Decoding root loop buffer', {
            rootTrackId: rootTrack.id,
            bufferKey,
          });
          // Decode and store in registry
          getAudioBufferFromS3(audioUrl, audioContextRef.current)
            .then((buffer) => {
              // Store buffer in registry
              bufferRegistry.storeBuffer(bufferKey, buffer, {
                name: 'root-loop',
                trackId: rootTrack.id
              });
              
              const duration = buffer.duration;
              loopLog('context.init', 'Root loop buffer decoded', {
                rootTrackId: rootTrack.id,
                duration,
                audioContextState: audioContextRef.current?.state,
              });
              if (engineRef.current && engineRef.current instanceof LoopListeningEngine) {
                engineRef.current.setLoopDuration(duration);
                setLoopDuration(duration);
              }
            })
            .catch((error) => {
              loopError('context.init', 'Root loop buffer decode failed', {
                rootTrackId: rootTrack.id,
                error: error?.message ?? String(error),
              });
              // Fallback to track duration if available
              if (rootTrack.duration && engineRef.current && engineRef.current instanceof LoopListeningEngine) {
                const duration = rootTrack.duration;
                loopWarn('context.init', 'Using root track metadata duration fallback', {
                  rootTrackId: rootTrack.id,
                  duration,
                });
                engineRef.current.setLoopDuration(duration);
                setLoopDuration(duration);
              }
            });
        }
      } else if (rootTrack.duration && engineRef.current && engineRef.current instanceof LoopListeningEngine) {
        loopWarn('context.init', 'No root audio URL — using metadata duration', {
          rootTrackId: rootTrack.id,
          duration: rootTrack.duration,
          hasAudioContext: Boolean(audioContextRef.current),
        });
        // Fallback to track duration if no audio URL
        const duration = rootTrack.duration;
        engineRef.current.setLoopDuration(duration);
        setLoopDuration(duration);
      } else {
        loopError('context.init', 'Could not determine loop duration during init', {
          rootTrackId: rootTrack.id,
          hasAudioUrl: Boolean(audioUrl),
          hasAudioContext: Boolean(audioContextRef.current),
          rootDuration: rootTrack.duration ?? null,
        });
      }
    }
    
    return () => {
      loopLog('context.init', 'Provider cleanup — destroying engine');
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [rootTrack]);
  
  /**
   * Play a track (starts loop mode)
   */
  const playTrack = useCallback(async (track) => {
    loopLog('context.playTrack', 'playTrack called', {
      trackId: track?.id ?? null,
      trackTitle: track?.title ?? null,
      hasEngine: Boolean(engineRef.current),
      loopDurationState: loopDuration,
      rootTrackId: rootTrack?.id ?? null,
      audioContextState: audioContextRef.current?.state ?? null,
    });

    if (!track || !engineRef.current) {
      loopError('context.playTrack', 'Abort: missing track or engine', {
        hasTrack: Boolean(track),
        hasEngine: Boolean(engineRef.current),
      });
      return;
    }
    
    // Clear automatic queue and add this track
    automaticQueueRef.current = [track];
    queueIndex.current = 0;
    currentTrackRef.current = track;
    setCurrentTrack(track);
    
    // Get loop duration from root track or use track duration
    let duration = track.is_loop ? loopDuration : track.duration;
    if (!duration && rootTrack?.duration && engineRef.current && engineRef.current instanceof LoopListeningEngine) {
      duration = rootTrack.duration;
      loopWarn('context.playTrack', 'Using root metadata duration fallback at play time', {
        trackId: track.id,
        duration,
        loopDurationState: loopDuration,
      });
      engineRef.current.setLoopDuration(duration);
      setLoopDuration(duration);
    }

    if (!duration) {
      loopError('context.playTrack', 'Abort: no duration available for playback', {
        trackId: track.id,
        trackIsLoop: track.is_loop ?? false,
        loopDurationState: loopDuration,
        trackDuration: track.duration ?? null,
        rootDuration: rootTrack?.duration ?? null,
      });
      return;
    }
    
    loopLog('context.playTrack', 'Delegating to engine.playTrack', {
      trackId: track.id,
      duration,
    });

    // Play the track (events will update state)
    await engineRef.current.playTrack(track, duration);
  }, [loopDuration, rootTrack]);
  
  /**
   * Queue a track (adds to manual queue)
   */
  const queueTrack = useCallback((track) => {
    loopLog('context.queueTrack', 'Queue track requested', {
      trackId: track?.id ?? null,
      hasEngine: Boolean(engineRef.current),
    });

    if (!track) return;
    
    // Add to manual queue
    manualQueueRef.current = [...manualQueueRef.current, track];

    // if no next track is set, set the next track to the queued track
    if(manualQueueRef.current.length === 1) {
      nextTrackIsFromAutomaticQueue.current = false;
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
      queueIndex.current = Math.max(0, queueIndex.current - 1);
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
    loopLog('context.togglePlayPause', 'togglePlayPause called', {
      isPlaying,
      currentTrackId: currentTrack?.id ?? null,
      hasEngine: Boolean(engineRef.current),
    });

    if (!engineRef.current) {
      loopError('context.togglePlayPause', 'Abort: no engine');
      return;
    }
    
    if (isPlaying) {
      engineRef.current.pause();
      // State will be updated via event
    } else {
      if (currentTrack) {
        await engineRef.current.resume();
        // State will be updated via event
      } else {
        loopWarn('context.togglePlayPause', 'Abort resume: no current track');
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
      loopLog('context.event', 'TRACK_STARTED', {
        trackId: data.track?.id ?? null,
      });
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
      loopLog('context.event', 'TRACK_CHANGED', {
        trackId: data.track?.id ?? null,
        previousTrackId: data.previousTrack?.id ?? null,
      });
      if(nextTrackIsFromAutomaticQueue.current) {
        queueIndex.current = automaticQueueRef.current.indexOf(data.track);
      }
      // Update play analytics for previous track before changing
      if (data.previousTrack) {
        updatePlay(true, data.previousTrack);
      }
      
      setCurrentTrack(data.track);
      currentTrackRef.current = data.track;

      // if new track came from manual queue, remove it from the queue
      if (manualQueueRef.current[0]?.id === data.track?.id) {
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
      loopLog('context.event', 'TRACK_ENDED', {
        trackId: track?.id ?? null,
      });
      
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
      loopLog('context.event', 'PLAYBACK_STARTED', {
        trackId: data?.track?.id ?? currentTrackRef.current?.id ?? null,
      });
      setIsPlaying(true);
    };

    // Handle playback stopped
    const handlePlaybackStopped = () => {
      loopLog('context.event', 'PLAYBACK_STOPPED');
      setIsPlaying(false);
      setCurrentTrack(null);
      currentTrackRef.current = null;
      setTrackPath([]);
    };

    // Handle playback paused
    const handlePlaybackPaused = () => {
      loopLog('context.event', 'PLAYBACK_PAUSED', {
        trackId: currentTrackRef.current?.id ?? null,
      });
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

