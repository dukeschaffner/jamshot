import React, { useRef, useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import styles from './Track.module.css';
import Region from './Region';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { useDAW } from '../DAWContext';
import DAWConfig from '../misc/DAWConfig';


const Track = ({
  track,
  tracksScrollContainerRef
}) => {

  const trackRef = useRef(null);  
  const [regions, setRegions] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Recording state
  const [recordingStartPos, setRecordingStartPos] = useState(0);
  const [recordingWidth, setRecordingWidth] = useState(0);
  
  // Get DAW context for recording state and playhead position
  const { isRecording, playheadLocation, duration, isCollab } = useDAW();

  const durationRef = useRef(duration);

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
        if(regions.find(region => region.id === data.region.id)) return; // Don't add region if it already exists
        setRegions(prevRegions => [...prevRegions, data.region]);
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

    // Listen for recording started event
    const handlePlaybackStarted = (data) => {
      // Convert current playhead time to percentage position
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
  }, [duration]);

  // Update recording width when recording and playhead position changes
  useEffect(() => {
    if (!track.readonly && isRecording && duration > 0) {
      const currentPos = (playheadLocation.time / duration) * 100;
      const indicatorWidth = currentPos - recordingStartPos;
      setRecordingWidth(indicatorWidth > 0 ? indicatorWidth : 0);
    } else {
      setRecordingWidth(0);
    }
  }, [isRecording, playheadLocation.time, recordingStartPos, duration]);

  // File processing function from RecordingWidget
  const processAudioChunks = async (chunks) => {
    if (!chunks || chunks.length === 0) return;
    
    try {
      // Create blob from chunks
      const blob = new Blob(chunks, { type: 'audio/webm' });
      
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      
      // Create audio context for decoding
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      return audioBuffer;
    } catch (error) {
      console.error('Error processing audio chunks:', error);
    }
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };
  
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    await createRegionFromFile(file);
  };

  // File handling functions from RecordingWidget
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    await createRegionFromFile(file);
  };

  const createRegionFromFile = async (file) => {
    if (!file) return;
    
    // Check if file is an audio file
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file');
      return;
    }
    
    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Create chunks
      const chunks = [new Uint8Array(arrayBuffer)];
      
      // Process the file
      const fileBuffer = await processAudioChunks(chunks);
      
      if (fileBuffer) {
        if (fileBuffer.duration > DAWConfig.audio.maxFileUploadDuration) {
          const minutes = Math.floor(DAWConfig.audio.maxFileUploadDuration / 60);
          alert(`File is too long. Please select a file shorter than ${minutes} minutes.`);
          return;
        }

        let endTime = fileBuffer.duration;
        if(!isCollab) { // Set DAW duration to file duration or max upload duration
          let duration = fileBuffer.duration;
          if(duration > DAWConfig.audio.maxRecordingDuration) {
            duration = DAWConfig.audio.maxRecordingDuration;
            endTime = duration;
          }
          eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: duration });
        }
        else if (fileBuffer.duration > durationRef.current) {
          endTime = durationRef.current;
        }

        // Create a new region from the file
        track.addRegionFromBuffer(fileBuffer, 0, 0, endTime, file.name);
      }
    } catch (error) {
      console.error('Error processing uploaded file:', error);
    }
  };

  return (
    <div className={styles.track} ref={trackRef}>
        {/* Recording indicator - shown during recording */}
        {isRecording && !track.readonly && recordingWidth > 0 ? (
          <div 
            className={styles.recordingIndicator}
            style={{
              left: `${recordingStartPos}%`,
              width: `${recordingWidth}%`
            }}
          />
        ) : (
          <>
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
                    readonly={track.readonly}
                  />
                )
              ))
            ) : (
              <div 
                className={`${styles.emptyTrack} ${isDragOver ? styles.dragOver : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById(`audio-file-input-${track.id}`).click();
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="empty-message">
                  <FontAwesomeIcon icon={faCloudUploadAlt} />
                  <span>Upload audio file or start recording</span>
                  <input 
                    type="file" 
                    id={`audio-file-input-${track.id}`}
                    className={styles.fileUploadInput} 
                    accept="audio/*"
                    onChange={handleFileChange}
                  />
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
};

export default Track;