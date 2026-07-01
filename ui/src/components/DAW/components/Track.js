import React, { useRef, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import styles from './Track.module.css';
import Region from './Region';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { useDAW } from '../DAWContext';
import DAWConfig from '../misc/DAWConfig';
import { useToast } from '@/lib/ToastContext';
import { captureDawAudioFileImported } from '@/lib/posthogAnalytics';
import { useProjectEditor } from '../project/ProjectEditorContext';
import RegionDragPreview from './RegionDragPreview';
import {
  computePlaceholderPlacement,
  decodeAudioFile,
  getAudioFileFromDataTransfer,
  getTimelineTimeFromEvent,
} from '../project/projectClipPlacement';
import { getProjectAssetFromDataTransfer } from '../project/projectAssetDrag';


const Track = ({
  track,
  tracksScrollContainerRef
}) => {

  const trackRef = useRef(null);  
  const [regions, setRegions] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPlaceholder, setDropPlaceholder] = useState(null);
  
  // Recording state
  const [recordingStartPos, setRecordingStartPos] = useState(0);
  const [recordingWidth, setRecordingWidth] = useState(0);
  
  const {
    dawMode,
    isRecording,
    playheadLocation,
    duration,
    isCollab,
    clipboard,
    pasteRegion,
    setContextMenuItems,
    setContextMenuPosition,
    setShowContextMenu,
    trackManagerRef,
    tracksContainerWidth,
  } = useDAW();
  const {
    canEdit: canEditProject,
    importAudioFileToTrack,
    placeLibraryAssetOnTrack,
    crossTrackDragPreview,
  } = useProjectEditor();
  const { showToast } = useToast();

  const isProjectMode = dawMode === 'project';
  const isReadOnly = isProjectMode;
  const canImportAudio = !isProjectMode || (canEditProject && !isRecording);
  
  // Context menu state
  const [pasteTime, setPasteTime] = useState(null);

  const durationRef = useRef(duration);
  const dragDepthRef = useRef(0);
  const dragFileDurationRef = useRef(null);
  const dragDecodePromiseRef = useRef(null);

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
        setRegions((prevRegions) => {
          if (prevRegions.find((region) => region.id === data.region.id)) {
            return prevRegions;
          }
          return [...prevRegions, data.region];
        });
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

    const handlePlaybackStarted = (data) => {
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
  }, [duration, track]);

  const isArmedForRecording = track.isArmed || track.isRecordingTrack;

  useEffect(() => {
    if (isArmedForRecording && isRecording && duration > 0) {
      const currentPos = (playheadLocation.time / duration) * 100;
      const indicatorWidth = currentPos - recordingStartPos;
      setRecordingWidth(indicatorWidth > 0 ? indicatorWidth : 0);
    } else {
      setRecordingWidth(0);
    }
  }, [isRecording, playheadLocation.time, recordingStartPos, duration, isArmedForRecording]);

  const dragAssetRef = useRef(null);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    dragFileDurationRef.current = null;
    dragDecodePromiseRef.current = null;
    dragAssetRef.current = null;
    setIsDragOver(false);
    setDropPlaceholder(null);
  }, []);

  const ensureDragFileDuration = useCallback(
    async (dataTransfer) => {
      if (dragFileDurationRef.current != null) {
        return dragFileDurationRef.current;
      }

      if (dragDecodePromiseRef.current) {
        return dragDecodePromiseRef.current;
      }

      const file = getAudioFileFromDataTransfer(dataTransfer);
      if (!file) return null;

      const audioContext = trackManagerRef.current?.audioContext;
      if (!audioContext) return null;

      dragDecodePromiseRef.current = decodeAudioFile(file, audioContext)
        .then((buffer) => {
          dragFileDurationRef.current = buffer.duration;
          return buffer.duration;
        })
        .catch(() => null)
        .finally(() => {
          dragDecodePromiseRef.current = null;
        });

      return dragDecodePromiseRef.current;
    },
    [trackManagerRef]
  );

  const resolveDragDuration = useCallback(
    async (dataTransfer) => {
      const asset = getProjectAssetFromDataTransfer(dataTransfer);
      if (asset?.durationSeconds != null) {
        dragAssetRef.current = asset;
        return asset.durationSeconds;
      }

      dragAssetRef.current = null;
      return ensureDragFileDuration(dataTransfer);
    },
    [ensureDragFileDuration]
  );

  const updateProjectDropPlaceholder = useCallback(
    async (event) => {
      const fileDuration = await resolveDragDuration(event.dataTransfer);
      if (fileDuration == null) {
        setDropPlaceholder(null);
        return;
      }

      const startTime = getTimelineTimeFromEvent(
        event,
        trackRef.current,
        durationRef.current
      );
      const placement = computePlaceholderPlacement({
        track,
        startTime,
        fileDuration,
        projectDuration: durationRef.current,
      });

      setDropPlaceholder(placement);
    },
    [resolveDragDuration, track]
  );

  const handleProjectDragEnter = (e) => {
    if (!canImportAudio) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleProjectDragOver = (e) => {
    if (!canImportAudio) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    updateProjectDropPlaceholder(e);
  };

  const handleProjectDragLeave = (e) => {
    if (!canImportAudio) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      resetDragState();
    }
  };

  const handleProjectDrop = async (e) => {
    if (!canImportAudio) return;
    e.preventDefault();
    e.stopPropagation();

    const asset = dragAssetRef.current ?? getProjectAssetFromDataTransfer(e.dataTransfer);
    const file = getAudioFileFromDataTransfer(e.dataTransfer);
    const startTime =
      dropPlaceholder?.isValid && dropPlaceholder.startTime != null
        ? dropPlaceholder.startTime
        : getTimelineTimeFromEvent(e, trackRef.current, durationRef.current);

    resetDragState();

    if (asset) {
      await placeLibraryAssetOnTrack(track.id, asset, startTime);
      return;
    }

    if (!file) return;
    await importAudioFileToTrack(track.id, file, startTime);
  };

  const processAudioChunks = async (chunks) => {
    if (!chunks || chunks.length === 0) return;
    
    try {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('Error processing audio chunks:', error);
    }
  };
  
  const handleDragOver = (e) => {
    if (isProjectMode) {
      handleProjectDragOver(e);
      return;
    }
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e) => {
    if (isProjectMode) {
      handleProjectDragLeave(e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };
  
  const handleDrop = async (e) => {
    if (isProjectMode) {
      await handleProjectDrop(e);
      return;
    }
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    const startTime = getTimelineTimeFromEvent(
      e,
      trackRef.current,
      durationRef.current
    );
    await createRegionFromFile(file, 'drag_drop', startTime);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';

    if (isProjectMode) {
      const startTime = playheadLocation?.time ?? 0;
      await importAudioFileToTrack(track.id, file, startTime);
      return;
    }

    await createRegionFromFile(file, 'file_input', 0);
  };

  const rejectFileTooLong = (maxDurationSeconds) => {
    const minutes = Math.floor(maxDurationSeconds / 60);
    showToast({
      message: `File is too long. Please select a file shorter than ${minutes} minutes.`,
      variant: 'error',
    });
  };

  const createRegionFromFile = async (file, importSource, startTime = 0) => {
    if (!file) return;
    
    if (!file.type.startsWith('audio/')) {
      showToast({ message: 'Please select an audio file.', variant: 'error' });
      return;
    }
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const chunks = [new Uint8Array(arrayBuffer)];
      const fileBuffer = await processAudioChunks(chunks);
      
      if (fileBuffer) {
        const maxUploadDuration = DAWConfig.audio.maxFileUploadDuration;
        if (fileBuffer.duration > maxUploadDuration) {
          rejectFileTooLong(maxUploadDuration);
          return;
        }

        let endTime = startTime + fileBuffer.duration;
        if(!isCollab) {
          let nextDuration = fileBuffer.duration;
          if(nextDuration > DAWConfig.audio.maxRecordingDuration) {
            nextDuration = DAWConfig.audio.maxRecordingDuration;
            endTime = startTime + nextDuration;
          }
          eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: nextDuration });
        }
        else if (endTime > durationRef.current) {
          endTime = durationRef.current;
        }

        track.addRegionFromBuffer(fileBuffer, startTime, 0, endTime, file.name);
        captureDawAudioFileImported({
          upload_flow_type: isCollab ? 'collab' : 'original',
          import_source: importSource,
          daw_track_id: track.id,
          filename_extension: file.name?.includes('.') ? file.name.split('.').pop() : undefined,
          duration_seconds: Math.round(fileBuffer.duration * 1000) / 1000,
        });
      }
    } catch (error) {
      console.error('Error processing uploaded file:', error);
      showToast({
        message: 'Could not read audio file. Please try a different format.',
        variant: 'error',
      });
    }
  };

  const handleTrackContextMenu = (e) => {
    if (isProjectMode) return;

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

    if (trackRef.current && duration > 0 && tracksScrollContainerRef && tracksScrollContainerRef.current) {
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

    eventBus.emit(DAW_EVENTS.UI.CONTEXT_MENU_OPEN, { source: 'track' });
    setContextMenuItems(menuItems);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleTrackPaste = () => {
    if (isRecording) return;

    if (clipboard && clipboard.trackId === track.id) {
      pasteRegion(pasteTime !== null ? pasteTime : undefined);
    }
    setShowContextMenu(false);
    setPasteTime(null);
  };

  const canPaste = clipboard && clipboard.trackId === track.id;

  const menuItems = [
    ...(canPaste ? [
    {
      label: "Paste Region",
      action: () => handleTrackPaste(),
      disabled: isRecording,
    }
  ] : []),
  ];

  const openFilePicker = (e) => {
    e.stopPropagation();
    if (isProjectMode && !canEditProject) return;
    document.getElementById(`audio-file-input-${track.id}`)?.click();
  };

  const trackDragHandlers = canImportAudio
    ? {
        onDragEnter: isProjectMode ? handleProjectDragEnter : undefined,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      }
    : {};

  return (
    <div 
      className={styles.track} 
      ref={trackRef}
      data-track-id={track.id}
      onContextMenu={handleTrackContextMenu}
      {...trackDragHandlers}
    >
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
          !isRecording && canImportAudio && (
            <div 
              className={`${styles.emptyTrack} ${isDragOver ? styles.dragOver : ''}`}
              onClick={openFilePicker}
            >
              <div className="empty-message">
                <FontAwesomeIcon icon={faCloudUploadAlt} />
                <span>
                  {isProjectMode
                    ? 'Click to upload or drag an audio file here'
                    : 'Upload audio file or start recording'}
                </span>
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

        {isProjectMode && dropPlaceholder && dropPlaceholder.widthPercent > 0 && (
          <div
            className={`${styles.dropPlaceholder} ${dropPlaceholder.isValid ? '' : styles.dropPlaceholderInvalid}`}
            style={{
              left: `${dropPlaceholder.leftPercent}%`,
              width: `${dropPlaceholder.widthPercent}%`,
            }}
            aria-hidden
          />
        )}

        {isProjectMode &&
          crossTrackDragPreview?.targetTrackId === track.id && (
            <RegionDragPreview
              preview={crossTrackDragPreview}
              duration={duration}
              tracksContainerWidth={tracksContainerWidth}
            />
          )}

        {isRecording && isArmedForRecording && recordingWidth > 0 && (
          <div 
            className={styles.recordingIndicator}
            style={{
              left: `${recordingStartPos}%`,
              width: `${recordingWidth}%`
            }}
          />
        )}
        
    </div>
  );
};

export default Track;
