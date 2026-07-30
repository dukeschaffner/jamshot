// ui/src/contexts/DAWContext.js
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import TrackManager from './core/TrackManager';
import AudioEngine from './core/AudioEngine';
import { eventBus } from './misc/EventBus';
import { DAW_EVENTS } from './misc/DAWEvents';
import api from '@/lib/api';
import { useAudio } from '@/lib/AudioContext';
import { undoManager, COMMAND_TYPES } from './core/UndoManager';
import DAWConfig from './misc/DAWConfig';
import AudioState from './core/AudioStateStore';
import { captureDawRecordStarted } from '@/lib/posthogAnalytics';
import {
  emitProjectTrackMixerState,
  loadProjectIntoTrackManager,
} from './project/projectLoader';
import { canCopyProjectRegion } from './project/projectRegionClipboard';
import { initDawExternalPlaybackListeners } from './dawExternalPlaybackListeners';
import { alignRecordedRegionToGrid } from './misc/recordingGridAlign';

const DAWContext = createContext();

export function DAWProvider({
  children,
  trackData,
  isCollab,
  mode,
  projectData,
}) {
  const dawMode = mode ?? (isCollab ? 'collab' : 'original');
  const isProjectMode = dawMode === 'project';
  const { isPlaying: isPlayingGlobal, togglePlayPause } = useAudio();
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
  const [viewWidth, setViewWidth] = useState(0);
  const [recordingTrackHasAudio, setRecordingTrackHasAudio] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [recordingMode, setRecordingMode] = useState('region'); // 'take' | 'region'
  const [gridLines, setGridLines] = useState([]);
  const [snapStrength, setSnapStrength] = useState(DAWConfig.ui.gridSnapThreshold);
  
  // Region selection and clipboard state
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [clipboard, setClipboard] = useState(null); // { region, trackId, bufferKey }

  // Undo/Redo state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoDescription, setUndoDescription] = useState(null);
  const [redoDescription, setRedoDescription] = useState(null);

  // Context menu state
  const [contextMenuItems, setContextMenuItems] = useState([]);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [showContextMenu, setShowContextMenu] = useState(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Loop mode state - extracted from trackData
  const [isLoop, setIsLoop] = useState(false);

  // Function for components to update grid lines
  const updateGridLines = useCallback((newGridLines) => {
    setGridLines(newGridLines);
  }, []);
  const recordingModeRef = useRef('take');
  useEffect(() => { recordingModeRef.current = recordingMode; }, [recordingMode]);
  const gridLinesRef = useRef([]);
  useEffect(() => { gridLinesRef.current = gridLines; }, [gridLines]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const playRecordedRef = useRef(false);
  const durationRef = useRef(0);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => initDawExternalPlaybackListeners(), []);

  
  useEffect(() => {
    const initializeDAW = async () => {
      try {
        const hasCollabData = trackData && trackData.length > 0;
        // original (upload page): no track data — still init with an empty recording track
        // collab: need track data (or isCollab while track is present)
        // project: need projectData
        const canInitialize = isProjectMode
          ? !!projectData
          : dawMode === 'original' || hasCollabData || isCollab;
        if (
          isLoading ||
          !canInitialize ||
          audioEngineRef.current ||
          trackManagerRef.current
        ) {
          return;
        }
        console.log('Initializing DAW. Mode:', dawMode, 'Track data:', trackData, 'Project:', projectData?.guid);
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

        AudioState.reset();
        if (!isProjectMode) {
          undoManager.clear();
          undoManager.init();
        }
        
        // Initialize audio context
        let audioContext;
        if(window.AudioContext) {
          audioContext = new window.AudioContext({
            latencyHint: 'interactive',
          });
        } else if(window.webkitAudioContext) {
          audioContext = new window.webkitAudioContext({
            latencyHint: 'interactive',
          });
        } else {
          throw new Error('AudioContext not supported');
        }

        // Create and load all tracks
        const tm = new TrackManager(audioContext);

        let metronomeBpm = null;
        let timeSignature = null;
        let metronomeOffset = null;
        let isLoopMode = false;

        let projectDurationSeconds = null;

        if (isProjectMode && projectData) {
          const projectSettings = await loadProjectIntoTrackManager(tm, projectData);
          metronomeBpm = projectSettings.metronomeBpm;
          timeSignature = projectSettings.timeSignature;
          metronomeOffset = projectSettings.metronomeOffset;
          projectDurationSeconds = projectSettings.durationSeconds;
        } else if (trackData && trackData.length > 0) {
          metronomeBpm = trackData[0].metronome_bpm;
          timeSignature = trackData[0].time_signature;
          metronomeOffset = trackData[0].metronome_offset;
          isLoopMode = trackData[0].is_loop || false;

          const isCollaboration = trackData[0]?.parent_track_id !== null;

          if (isCollaboration) {
            await tm.loadStemChain(trackData[0]);
          } else {
            await tm.loadAllTracks(trackData);
          }
        }

        if (!isProjectMode) {
          tm.createEmptyTrack('recording-track');
        }
        
        // Initialize audio engine
        const ae = new AudioEngine(audioContext, isCollab && !isProjectMode);
        await ae.initialize(tm, metronomeBpm, timeSignature, metronomeOffset);

        if (isProjectMode) {
          emitProjectTrackMixerState(tm);
          if (projectDurationSeconds) {
            setDuration(projectDurationSeconds);
          }
        }
        
        trackManagerRef.current = tm;
        audioEngineRef.current = ae;
        setTracks(tm.getAllTracks());
        if(metronomeBpm) {
          setMetronomeBpm(metronomeBpm);
        }
        if(timeSignature) {
          setTimeSignature(timeSignature);
        }
        if(metronomeOffset) {
          setMetronomeOffset(metronomeOffset);
        }
        setIsLoop(isLoopMode);


        // when in dev env, save objects to window for debugging
        if(process.env.NODE_ENV === 'development') {
          window.trackManager = tm;
          window.audioEngine = ae;
        }

      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeDAW();
  }, [trackData, projectData, dawMode, isProjectMode]);

  useEffect(() => {
    if (isProjectMode) {
      if (projectData?.durationSeconds) {
        setDuration(projectData.durationSeconds);
      }
      return;
    }

    if (tracks.length > 0) {
      // Find the latest region end time from all tracks
      let latestEndTime = 0;
      
      tracks.forEach(track => {
        if (track.regions && track.regions.length > 0) {
          track.regions.forEach(region => {
            if (region.endTime && region.endTime > latestEndTime) {
              latestEndTime = region.endTime;
            }
          });
        }
      });
      
      // Set a default duration of 90 seconds if no regions found or latest end time is 0
      setDuration(latestEndTime > 0 ? latestEndTime : DAWConfig.project.defaultDuration);
    } else {
      // Default duration when no tracks exist
      setDuration(DAWConfig.project.defaultDuration);
    }
  }, [tracks, isProjectMode, projectData]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (audioEngineRef.current) {
        audioEngineRef.current.destroy();
      }
      if (trackManagerRef.current) {
        trackManagerRef.current.destroy();
      }
      if (!isProjectMode) {
        undoManager.destroy();
      }
    };
  }, [isProjectMode]);

  // Region / track selection handlers (defined before useEffect that uses them)
  const selectRegion = useCallback((regionId, trackId) => {
    setSelectedRegionId(regionId);
    setSelectedTrackId(trackId);
    eventBus.emit(DAW_EVENTS.REGION.SELECT, { regionId, trackId });
  }, []);

  const selectTrack = useCallback((trackId) => {
    if (trackId == null) return;
    setSelectedTrackId(trackId);
    setSelectedRegionId(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRegionId(null);
    // Project mode always keeps exactly one track selected
    if (!isProjectMode) {
      setSelectedTrackId(null);
    }
  }, [isProjectMode]);

  // Ensure project mode always has one track selected
  useEffect(() => {
    if (!isProjectMode || tracks.length === 0) return;

    const trackStillExists =
      selectedTrackId != null && tracks.some((track) => track.id === selectedTrackId);

    if (!trackStillExists) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [isProjectMode, tracks, selectedTrackId]);

  // Copy handler
  const copyRegion = useCallback(() => {
    if (!selectedRegionId || !selectedTrackId || !trackManagerRef.current) {
      return false;
    }

    const track = trackManagerRef.current.getTrack(selectedTrackId);
    if (!track) {
      return false;
    }

    const region = track.regions.find(r => r.id === selectedRegionId);
    if (!region) {
      return false;
    }

    if (isProjectMode && !canCopyProjectRegion(region)) {
      return false;
    }

    setClipboard({
      region: { ...region },
      trackId: selectedTrackId,
      bufferKey: region.key,
      projectAssetId: region.projectAssetId ?? null,
    });

    return true;
  }, [selectedRegionId, selectedTrackId, isProjectMode]);

  // Paste handler (collab / non-project: same-track only)
  const pasteRegion = useCallback((pasteTime = null) => {
    if (!clipboard || !trackManagerRef.current) {
      return false;
    }

    const { region, trackId, bufferKey } = clipboard;
    
    // Get the track that the region was copied from (regions can only be pasted to the same track)
    const targetTrack = trackManagerRef.current.getTrack(trackId);
    if (!targetTrack) {
      return false;
    }

    // Paste at specified time (from right-click) or playhead position
    const newStartTime = pasteTime !== null ? pasteTime : playheadLocation.time;
    const regionDuration = region.endTime - region.startTime;
    let newEndTime = newStartTime + regionDuration;

    // If pasted region extends past project end, cut it to end at project end
    if (newEndTime > durationRef.current) {
      newEndTime = durationRef.current;
    }

    targetTrack.addRegion(
      bufferKey,
      newStartTime,
      region.offset,
      newEndTime,
      region.name,
      false, // overwriteTrack
      true   // recordUndo - record this for undo/redo
    );

    return true;
  }, [clipboard, playheadLocation]);

  // Repeat handler - duplicates a region immediately after it
  const repeatRegion = useCallback(() => {
    if (!selectedRegionId || !selectedTrackId || !trackManagerRef.current) {
      return false;
    }

    const track = trackManagerRef.current.getTrack(selectedTrackId);
    if (!track) {
      return false;
    }

    const region = track.regions.find(r => r.id === selectedRegionId);
    if (!region) {
      return false;
    }

    // Calculate the new start time (immediately after the region ends)
    const newStartTime = region.endTime;
    const regionDuration = region.endTime - region.startTime;
    let newEndTime = newStartTime + regionDuration;

    // If repeated region extends past project end, cut it to end at project end
    if (newEndTime > durationRef.current) {
      newEndTime = durationRef.current;
    }

    // Don't add if the new start time is beyond the project duration
    if (newStartTime >= durationRef.current) {
      return false;
    }

    // Add the repeated region and get the newly created region
    const newRegion = track.addRegion(
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
      selectRegion(newRegion.id, selectedTrackId);
    }

    return true;
  }, [selectedRegionId, selectedTrackId, selectRegion]);

  // Split handler - splits a region at playhead position
  const splitRegion = useCallback(() => {
    if (!selectedRegionId || !selectedTrackId || !trackManagerRef.current) {
      return false;
    }

    const track = trackManagerRef.current.getTrack(selectedTrackId);
    if (!track) {
      return false;
    }

    const region = track.regions.find(r => r.id === selectedRegionId);
    if (!region) {
      return false;
    }

    // Check if playhead is within the selected region
    const playheadTime = playheadLocation.time;
    if (playheadTime <= region.startTime || playheadTime >= region.endTime) {
      return false; // Playhead is not over the selected region
    }

    // Calculate split time relative to region's start
    const splitTimeRelative = playheadTime - region.startTime;

    // Calculate offsets for the two new regions
    // Left region: same offset as original
    // Right region: offset + splitTimeRelative
    const leftRegionOffset = region.offset;
    const rightRegionOffset = region.offset + splitTimeRelative;

    // Create the two split regions
    const leftRegion = track.addRegion(
      region.key,
      region.startTime,
      leftRegionOffset,
      playheadTime,
      `${region.name} (1)`,
      false, // overwriteTrack
      false  // recordUndo - we'll handle undo manually
    );

    const rightRegion = track.addRegion(
      region.key,
      playheadTime,
      rightRegionOffset,
      region.endTime,
      `${region.name} (2)`,
      false, // overwriteTrack
      false  // recordUndo - we'll handle undo manually
    );

    // Remove the original region (without undo recording since we're handling it manually)
    eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
      region: region,
      trackId: selectedTrackId,
      recordUndo: false
    });

    // Record the split operation for undo/redo
    undoManager.recordCommand({
      type: COMMAND_TYPES.REGION_SPLIT,
      trackId: selectedTrackId,
      regionId: region.id, // Store original region ID for undo
      before: {
        startTime: region.startTime,
        endTime: region.endTime,
        offset: region.offset,
        key: region.key,
        duration: region.duration,
        active: region.active,
        name: region.name
      },
      after: {
        leftRegion: leftRegion ? {
          id: leftRegion.id,
          startTime: leftRegion.startTime,
          endTime: leftRegion.endTime,
          offset: leftRegion.offset,
          key: leftRegion.key,
          duration: leftRegion.duration,
          active: leftRegion.active,
          name: leftRegion.name
        } : null,
        rightRegion: rightRegion ? {
          id: rightRegion.id,
          startTime: rightRegion.startTime,
          endTime: rightRegion.endTime,
          offset: rightRegion.offset,
          key: rightRegion.key,
          duration: rightRegion.duration,
          active: rightRegion.active,
          name: rightRegion.name
        } : null
      },
      description: 'Split Region'
    });

    // Select the first (left) split region
    if (leftRegion) {
      selectRegion(leftRegion.id, selectedTrackId);
    }

    return true;
  }, [selectedRegionId, selectedTrackId, selectRegion, playheadLocation]);

  // Undo handler
  const undo = useCallback(() => {
    if (!trackManagerRef.current) {
      return false;
    }
    return undoManager.undo(trackManagerRef.current);
  }, []);

  // Redo handler
  const redo = useCallback(() => {
    if (!trackManagerRef.current) {
      return false;
    }
    return undoManager.redo(trackManagerRef.current);
  }, []);

  useEffect(() => {
    // Listen for transport events
    const handlePlaybackStarted = () => {
      if(isPlayingGlobal) {
        togglePlayPause();
      }
      setIsPlaying(true);
      if(!playRecordedRef.current) {
        recordPlay();
      }
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
      captureDawRecordStarted({
        upload_flow_type: isCollab ? 'collab' : 'original',
        parent_track_id: trackData?.[0]?.id ?? null,
      });
    };
    
    const handleRecordingStopped = (data) => {
      setIsRecording(false);
      AudioState.recordingTargetTrackId = null;

      if (isProjectMode) {
        return;
      }

      const track = trackManagerRef.current.getTrack('recording-track');
      if (!track) return;
      const overwriteTrack = recordingModeRef.current === 'take';
      const rawOffset = data.offset ?? 0;
      const rawEndTime = data.startTime + (data.duration ?? 0) - rawOffset;
      const aligned = alignRecordedRegionToGrid(
        {
          startTime: data.startTime,
          endTime: rawEndTime,
          offset: rawOffset,
        },
        gridLinesRef.current,
        (DAWConfig.ui.recordSnapThresholdMs ?? 40) / 1000
      );
      track.addRegion(
        data.bufferKey,
        aligned.startTime,
        aligned.offset,
        aligned.endTime,
        '',
        overwriteTrack,
        true,
        data.latencyData
      );
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

    const handleMonitorStarted = () => setIsMonitoring(true);
    const handleMonitorStopped = () => setIsMonitoring(false);

    const handleSnapStrengthChange = (data) => {
      setSnapStrength(data.snapStrength);
    };

    const handleMetronomeOffsetChange = (data) => {
      const newOffset = data.offset;
      setMetronomeOffset(newOffset);
    };
    
    const handleSeek = (data) => {
      const position = (data.time / durationRef.current) * 100;
      setPlayheadLocation({time: data.time, position: position});
    };

    const handleRegionsUpdated = (data) => {
      if(data.trackId === 'recording-track') {
        if(trackManagerRef.current){
          const track = trackManagerRef.current.getTrack('recording-track');
          if(track) {
            const activeRegions = track.getActiveRegions();
            if(activeRegions.length > 0) {
              setRecordingTrackHasAudio(true);
              return;
            }
          }
        }
        setRecordingTrackHasAudio(false);
      }
    };

    const handleRegionRemoved = (data) => {
      // Clear region selection if the removed region was selected (track stays selected in project mode)
      if (selectedRegionId === data.region.id && selectedTrackId === data.trackId) {
        clearSelection();
      }
      handleRegionsUpdated(data);
    };
    
    const handleDurationChange = (data) => {
      setDuration(data.duration);
    };

    // Undo/Redo state change handler
    const handleUndoStateChange = (data) => {
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      setUndoDescription(data.undoDescription);
      setRedoDescription(data.redoDescription);
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
    eventBus.on(DAW_EVENTS.REGION.ADDED, handleRegionsUpdated);
    eventBus.on(DAW_EVENTS.REGION.REMOVED, handleRegionRemoved);
    eventBus.on(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, handleDurationChange);
    eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.MONITOR_STARTED, handleMonitorStarted);
    eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.MONITOR_STOPPED, handleMonitorStopped);
    eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.SNAP_STRENGTH_CHANGE, handleSnapStrengthChange);
    eventBus.on(DAW_EVENTS.UNDO.STATE_CHANGE, handleUndoStateChange);

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
      eventBus.off(DAW_EVENTS.REGION.ADDED, handleRegionsUpdated);
      eventBus.off(DAW_EVENTS.REGION.REMOVED, handleRegionRemoved);
      eventBus.off(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, handleDurationChange);
      eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.MONITOR_STARTED, handleMonitorStarted);
      eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.MONITOR_STOPPED, handleMonitorStopped);
      eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.SNAP_STRENGTH_CHANGE, handleSnapStrengthChange);
      eventBus.off(DAW_EVENTS.UNDO.STATE_CHANGE, handleUndoStateChange);
    };
  }, [selectedRegionId, selectedTrackId, clearSelection, isPlayingGlobal, togglePlayPause, isCollab, trackData, isProjectMode]); 

  const recordPlay = async () => {
    if (!trackData || !isCollab || playRecordedRef.current) return;
    
    try {
      playRecordedRef.current = true;
      
      // Get referrer URL for discovery method
      const referrerUrl = document.referrer || null;
      
      const response = await api.post(`/tracks/${trackData[0].id}/play`, {
        discovery_method: 'track_page',
        referrer_url: referrerUrl
      });
      
      console.log('Play recorded for track:', trackData[0].id);
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

  const syncTracksFromManager = useCallback(() => {
    if (!trackManagerRef.current) return [];
    const nextTracks = trackManagerRef.current.getAllTracks();
    setTracks(nextTracks);
    return nextTracks;
  }, []);

  return (
    <DAWContext.Provider value={{
      dawMode,
      isCollab,
      trackManagerRef,
      syncTracksFromManager,
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
      setMetronomeOffset,
      duration,
      zoom,
      scrollLeft,
      setZoomLevel,
      setScrollLeftValue,
      tracksContainerWidth,
      setTracksContainerWidth,
      viewWidth,
      setViewWidth,
      recordingTrackHasAudio,
      isMonitoring,
      recordingMode,
      setRecordingMode,
      gridLines,
      updateGridLines,
      snapStrength,
      selectedRegionId,
      selectedTrackId,
      selectRegion,
      selectTrack,
      clearSelection,
      copyRegion,
      pasteRegion,
      repeatRegion,
      splitRegion,
      clipboard,
      // Undo/Redo
      canUndo,
      canRedo,
      undoDescription,
      redoDescription,
      undo,
      redo,
      // Context menu
      contextMenuItems,
      setContextMenuItems,
      contextMenuPosition,
      setContextMenuPosition,
      showContextMenu,
      setShowContextMenu,
      // Fullscreen
      isFullscreen,
      setIsFullscreen,
      // Loop mode
      isLoop,
    }}>
      {children}
    </DAWContext.Provider>
  );
}

export const useDAW = () => useContext(DAWContext);