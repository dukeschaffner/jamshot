import React, { useRef, useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import styles from './Track.module.css';
import Region from './Region';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';


const Track = ({
  track,
  tracksScrollContainerRef
}) => {

  const trackRef = useRef(null);  
  const [regions, setRegions] = useState(track.regions);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const handleRegionAdd = (data) => {
      if (data.trackId === track.id) {
        setRegions(prevRegions => [...prevRegions, data.region]);
      }
    };
    
    const handleRegionUpdate = (data) => {
      if (data.trackId === track.id) {
        setRegions(prevRegions => prevRegions.map(region => region.id === data.region.id ? data.region : region));
        track.updateRegion(data.region);
      }
    };

    eventBus.on(DAW_EVENTS.REGION.ADD, handleRegionAdd);
    eventBus.on(DAW_EVENTS.REGION.UPDATE, handleRegionUpdate);
    return () => {
      eventBus.off(DAW_EVENTS.REGION.ADD, handleRegionAdd);
      eventBus.off(DAW_EVENTS.REGION.UPDATE, handleRegionUpdate);
    };
  }, []);

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

  // File handling functions from RecordingWidget
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
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
        // Create a new region from the file
        track.addRegionFromBuffer(fileBuffer, 0, 0, fileBuffer.duration, file.name);
      }
    } catch (error) {
      console.error('Error processing uploaded file:', error);
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
        // Create a new region from the file
        const newRegion = {
          id: Date.now().toString(),
          key: `region_${Date.now()}`,
          buffer: fileBuffer,
          startTime: 0,
          endTime: fileBuffer.duration,
          name: file.name || `Audio ${regions.length + 1}`
        };
        
        // Add the region to the track
        setRegions(prevRegions => [...prevRegions, newRegion]);
        
        // Emit event to notify other components
        eventBus.emit(DAW_EVENTS.REGION.ADD, {
          trackId: track.id,
          region: newRegion
        });
      }
    } catch (error) {
      console.error('Error processing dropped file:', error);
    }
  };

  return (
    <div className={styles.track} ref={trackRef}>
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
              <span>Drop audio file here or click to browse</span>
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
    </div>
  );
};

export default Track;