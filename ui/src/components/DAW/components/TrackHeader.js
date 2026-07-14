'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useDAW } from '../DAWContext';
import { useProjectEditor } from '../project/ProjectEditorContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faCircle, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import ProjectTrackActionsMenu from './ProjectTrackActionsMenu';
import styles from './TrackHeader.module.css';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import AudioState from '../core/AudioStateStore';
import Popover from '../../Popover';
import TrackContributorAvatar from './TrackContributorAvatar';
import { useUser } from '../../../contexts/UserContext';

export default function TrackHeader({
  track,
  canReorder = false,
  isTrackMutationPending: isTrackMutationPendingProp = false,
  onDragStart,
  onDragEnd,
}) {
  const [faderValue, setFaderValue] = useState(0.8);
  const [isDraggingFader, setIsDraggingFader] = useState(false);
  const faderRef = useRef(null);

  const [isSolo, setIsSolo] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const {
    isPlaying,
    isRecording,
    isMonitoring,
    selectedTrackId,
    selectTrack,
  } = useDAW();
  const {
    isActive: isProjectEditor,
    canEdit: canEditProject,
    isTrackMutationPending,
    armedTrackId,
    setArmedTrackId,
    renameProjectTrack,
  } = useProjectEditor();

  const { user } = useUser();

  const [meterLevel, setMeterLevel] = useState(-60);
  const meterAnimationFrameRef = useRef(null);
  const [hasInputDevice, setHasInputDevice] = useState(false);
  const [isMonitorPopoverVisible, setIsMonitorPopoverVisible] = useState(false);
  const monitorPopoverAnchorRef = useRef(null);
  const monitorPopoverCloseTimeoutRef = useRef(null);
  const renameInputRef = useRef(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Listen for input device changes
  useEffect(() => {
    const checkInputDevice = () => {
      setHasInputDevice(!!AudioState.selectedAudioInputDevice);
    };
    
    checkInputDevice();
    const handleDeviceChange = () => checkInputDevice();
    eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, handleDeviceChange);
    
    return () => {
      eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, handleDeviceChange);
    };
  }, []);

  // Initialize fader value from track gain
  useEffect(() => {
    if (track && track.gain !== undefined) {
      setFaderValue(track.gain);
    }
  }, [track]);

  // Helper function to convert dB to meter width percentage
  const dbToPercent = (db) => {
    // Map -60dB to 0% and 0dB to 100%
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  };

  // Helper function to get meter color based on level
  const getMeterColor = (db) => {
    if (db > -6) return '#ff3b30'; // Red for high levels
    if (db > -12) return '#ff9500'; // Orange for medium-high levels
    if (db > -24) return '#34c759'; // Green for good levels
    return '#007aff'; // Blue for low levels
  };

  // Function to start the meter animation loop
  const startMeterAnimation = () => {
    // Use time-based throttling instead of frame counting
    let lastUpdateTime = 0;
    // Update interval in milliseconds (higher = less frequent updates)
    const updateInterval = 60; // Update every 60ms
    
    const updateMeter = () => {
      const currentTime = performance.now();
      const timeSinceLastUpdate = currentTime - lastUpdateTime;
      
      // Only process meter updates if enough time has passed
      if (timeSinceLastUpdate >= updateInterval) {
        lastUpdateTime = currentTime;
        
        // Get analyzer from track
        const analyzer = track?.getAnalyzer();
        
        // For recording track: show meter when playing (not soloed), monitoring enabled, OR input device selected
        // For other tracks: show meter when playing and not soloed
        const isRecordingTrack = track.id === 'recording-track';
        const isArmedProjectTrack = isProjectEditor && track.id === armedTrackId;
        const shouldShowMeter = isPlaying ||
          ((isRecordingTrack || isArmedProjectTrack) && (isMonitoring || hasInputDevice));
        
        if (analyzer && shouldShowMeter) {
          const dataArray = new Uint8Array(analyzer.frequencyBinCount);
          analyzer.getByteFrequencyData(dataArray);
          
          // Calculate RMS value
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += (dataArray[i] / 255.0) ** 2;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          
          // Convert to dB (with a floor of -60dB)
          const db = rms > 0 ? 20 * Math.log10(rms) : -60;
          setMeterLevel(Math.max(-60, db));
        } else if (!shouldShowMeter) {
          // Gradually decrease level when not showing meter
          setMeterLevel(prevLevel => Math.max(-60, prevLevel - 3));
        }
      }
      
      meterAnimationFrameRef.current = requestAnimationFrame(updateMeter);
    };
    
    meterAnimationFrameRef.current = requestAnimationFrame(updateMeter);
  };

  // Start meter animation when component mounts
  useEffect(() => {
    startMeterAnimation();
    
    // Cleanup function
    return () => {
      if (meterAnimationFrameRef.current) {
        cancelAnimationFrame(meterAnimationFrameRef.current);
      }
    };
  }, [track, isPlaying, isSolo, isMonitoring, hasInputDevice]);

  const handleFaderMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingFader(true);
  };

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingFader) return;

      // Get container for mouse position calculation
      const container = faderRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

      // Calculate the new gain value (0 to 1 range)
      const faderRect = faderRef.current.getBoundingClientRect();
      const newMousePos = Math.max(0, Math.min(100, ((e.clientX - faderRect.left) / faderRect.width) * 100));
      const newGain = Math.min(1, Math.max(0, newMousePos / 100));
      setFaderValue(newGain);
    };

    const handleMouseUp = (e) => {
      e.stopPropagation();
      setIsDraggingFader(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingFader]);

  const handleSoloClick = (e) => {
    e.stopPropagation();
    if (isProjectEditor) {
      selectTrack(track.id);
    }
    setIsSolo(prev => !prev);
  };

  const handleMuteClick = (e) => {
    e.stopPropagation();
    if (isProjectEditor) {
      selectTrack(track.id);
    }
    setIsMuted(prev => !prev);
  };

  const handleArmTrack = (e) => {
    e.stopPropagation();
    if (!canEditProject || isRecording) return;
    selectTrack(track.id);
    setArmedTrackId(track.id === armedTrackId ? null : track.id);
  };

  const handleHeaderClick = () => {
    if (isProjectEditor) {
      selectTrack(track.id);
    }
  };

  const handleMonitorClick = (e) => {
    e.stopPropagation();
    const enabled = !isMonitoring;
    eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.MONITOR_TOGGLE, { enabled });
  };

  const showMonitorPopover = () => {
    if (monitorPopoverCloseTimeoutRef.current) {
      clearTimeout(monitorPopoverCloseTimeoutRef.current);
      monitorPopoverCloseTimeoutRef.current = null;
    }
    setIsMonitorPopoverVisible(true);
  };

  const hideMonitorPopover = () => {
    monitorPopoverCloseTimeoutRef.current = setTimeout(() => {
      setIsMonitorPopoverVisible(false);
      monitorPopoverCloseTimeoutRef.current = null;
    }, 120);
  };

  useEffect(() => {
    eventBus.emit(DAW_EVENTS.TRACK.SOLO, { trackId: track.id, isSolo: isSolo });
  }, [isSolo]);

  useEffect(() => {
    eventBus.emit(DAW_EVENTS.TRACK.MUTE, { trackId: track.id, isMuted: isMuted });
  }, [isMuted]);

  // Listen for solo events from other tracks
  useEffect(() => {
    const handleSoloEvent = (data) => {
      const { trackId, isSolo } = data;
      
      // If another track is being soloed and this track is currently soloed
      if (trackId !== track.id && isSolo) {
        setIsSolo(false);
      }
    };

    eventBus.on(DAW_EVENTS.TRACK.SOLO, handleSoloEvent);

    return () => {
      eventBus.off(DAW_EVENTS.TRACK.SOLO, handleSoloEvent);
    };
  }, [track.id]);

  useEffect(() => {
    eventBus.emit(DAW_EVENTS.TRACK.VOLUME_CHANGE, { trackId: track.id, volume: faderValue });
  }, [faderValue]);

  useEffect(() => {
    return () => {
      if (monitorPopoverCloseTimeoutRef.current) {
        clearTimeout(monitorPopoverCloseTimeoutRef.current);
      }
    };
  }, []);

  // Generate display name for track
  const getTrackDisplayName = () => {
    if (track.id === 'recording-track') {
      return 'Recording Track';
    }
    return track.title || `Track ${track.id || 1}`;
  };

  const canRenameTrack =
    isProjectEditor && canEditProject && track.id !== 'recording-track';
  const trackMutationPending = isTrackMutationPending || isTrackMutationPendingProp;

  const startRenaming = () => {
    if (!canRenameTrack || trackMutationPending) return;
    selectTrack(track.id);
    setRenameValue(getTrackDisplayName());
    setIsRenaming(true);
  };

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  const cancelRenaming = () => {
    setIsRenaming(false);
    setRenameValue('');
  };

  const commitRename = async () => {
    if (!isRenaming) return;

    const nextName = renameValue.trim();
    const currentName = getTrackDisplayName();
    setIsRenaming(false);
    setRenameValue('');

    if (!nextName || nextName === currentName) {
      return;
    }

    await renameProjectTrack(track.id, nextName);
  };

  const handleRenameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRenaming();
    }
  };

  const handleDragHandleMouseDown = (event) => {
    event.stopPropagation();
    if (isProjectEditor) {
      selectTrack(track.id);
    }
  };

  const handleDragStart = (event) => {
    if (!canReorder || trackMutationPending) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(track.id));
    onDragStart?.(track.id);
  };

  const handleDragEnd = () => {
    onDragEnd?.();
  };

  const contributorProfile = track.id === 'recording-track' && user
    ? {
        profilePicUrl: user.profile_pic_url,
        username: user.username,
        verified: user.verified,
      }
    : {
        profilePicUrl: track.profile_pic_url,
        username: track.username,
        verified: track.verified,
      };

  const showContributorAvatar = isProjectEditor
    ? false
    : track.id === 'recording-track'
      ? !!user
      : true;

  const isTrackSelected = isProjectEditor && selectedTrackId === track.id;

  return (
    <div
      className={`${styles.trackHeader} ${isTrackSelected ? styles.trackHeaderSelected : ''}`}
      onClick={handleHeaderClick}
    >
      <div className={styles.trackNameRow}>
        {canReorder && (
          <button
            type="button"
            className={styles.dragHandle}
            draggable={!trackMutationPending}
            onMouseDown={handleDragHandleMouseDown}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            disabled={trackMutationPending}
            aria-label="Drag to reorder track"
            title="Drag to reorder track"
          >
            <FontAwesomeIcon icon={faGripVertical} aria-hidden />
          </button>
        )}

        {isRenaming ? (
          <input
            ref={renameInputRef}
            className={styles.trackNameInput}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={handleRenameKeyDown}
            maxLength={200}
            aria-label="Track name"
          />
        ) : (
          <button
            type="button"
            className={`${styles.trackName} ${canRenameTrack ? styles.trackNameEditable : ''}`}
            onClick={canRenameTrack ? startRenaming : undefined}
            onDoubleClick={canRenameTrack ? startRenaming : undefined}
            disabled={!canRenameTrack || trackMutationPending}
            title={canRenameTrack ? 'Click to rename track' : undefined}
          >
            {getTrackDisplayName()}
          </button>
        )}
      </div>

      <div className={styles.controlRow}>
        {showContributorAvatar && (
          <TrackContributorAvatar
            profilePicUrl={contributorProfile.profilePicUrl}
            username={contributorProfile.username}
            verified={contributorProfile.verified}
          />
        )}
        <div className={styles.buttonGroup}>
        <button
          className={`${styles.controlButton} ${isMuted ? `${styles.active} ${styles.muteActive}` : ''}`}
          onClick={handleMuteClick}
          title="Mute track"
        >
          <span>M</span>
        </button>

        <button
          className={`${styles.controlButton} ${isSolo ? styles.active : ''}`}
          onClick={handleSoloClick}
          title="Solo track"
        >
          <span>S</span>
        </button>
        
        {isProjectEditor && canEditProject && (
          <>
            <button
              className={`${styles.controlButton} ${armedTrackId === track.id ? styles.armActive : ''}`}
              onClick={handleArmTrack}
              disabled={isRecording}
              title={armedTrackId === track.id ? 'Disarm track' : 'Arm track for recording'}
              type="button"
            >
              <FontAwesomeIcon icon={faCircle} />
            </button>
            <ProjectTrackActionsMenu track={track} disabled={trackMutationPending} />
          </>
        )}

        {(track.id === 'recording-track' || (isProjectEditor && armedTrackId === track.id)) && (
          <>
            <div
              ref={monitorPopoverAnchorRef}
              className={styles.monitorButtonWrapper}
              onMouseEnter={showMonitorPopover}
              onMouseLeave={hideMonitorPopover}
            >
              <button
                className={`${styles.controlButton} ${isMonitoring ? styles.active : ''}`}
                onClick={handleMonitorClick}
                title="Input Monitor"
              >
                <FontAwesomeIcon icon={faMicrophone} />
              </button>
            </div>

            <Popover
              isVisible={isMonitorPopoverVisible}
              anchorElement={monitorPopoverAnchorRef.current}
              className={styles.monitorPopover}
              onMouseEnter={showMonitorPopover}
              onMouseLeave={hideMonitorPopover}
            >
              <p className={styles.monitorPopoverText}>
                Input monitoring requires a low latency setup. See{' '}
                <Link href="/help?article=daw-best-practices">
                  DAW best practices
                </Link>{' '}
                for how to optimize your setup. If there is too much delay, you can
                turn off input monitoring, record in a DAW with the{' '}
                <Link href="/plugin">Sterio Plugin</Link>, or directly monitor audio
                from your audio interface if using one.
              </p>
            </Popover>
          </>
        )}
        </div>
      </div>
      
      {/* Audio Meter */}
      <div 
        className={styles.audioMeterContainer} 
        ref={faderRef}
      >
        <div 
          className={styles.audioMeterBar} 
          style={{ 
            width: `${dbToPercent(meterLevel)}%`,
            backgroundColor: getMeterColor(meterLevel)
          }}
        ></div>
        
        {/* Fader handle - only shown if not recording and there's a track to control */}
        {track && (
          <>
            <div 
              className={`${styles.faderHandle} ${isDraggingFader ? styles.dragging : ''}`}
              style={{ 
                left: `${faderValue * 100}%`,
                backgroundColor: isDraggingFader ? 'var(--seafoam)' : 'rgba(255, 255, 255, 0.7)'
              }}
              onMouseDown={handleFaderMouseDown}
              title={`Volume: ${Math.round(faderValue * 100)}%`}
            ></div>
            <div className={styles.volumeIndicator} style={{ left: `${faderValue * 100}%` }}>
              {Math.round(faderValue * 100)}%
            </div>
          </>
        )}
      </div>
    </div>
  );
} 