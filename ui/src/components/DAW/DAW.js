'use client';

import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause } from '@fortawesome/free-solid-svg-icons';
import AudioEngine from './core/AudioEngine';
import { eventBus } from './EventBus';
import { DAW_EVENTS } from './DAWEvents';
import './DawBody.css';
import { getAudioBufferFromS3 } from './DAWUtils';

export default function DAW({ track }) {

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const audioEngineRef = useRef(null);



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
      setCurrentTime(data.time);
    };
    
    // Register event listeners
    eventBus.on(DAW_EVENTS.PLAYBACK.STARTED, handlePlaybackStarted);
    eventBus.on(DAW_EVENTS.PLAYBACK.STOPPED, handlePlaybackStopped);
    eventBus.on(DAW_EVENTS.PLAYBACK.PAUSED, handlePlaybackPaused);
    eventBus.on(DAW_EVENTS.PLAYBACK.POSITION_UPDATE, handlePositionUpdate);

    // Return cleanup function
    return () => {
      eventBus.off(DAW_EVENTS.PLAYBACK.STARTED, handlePlaybackStarted);
      eventBus.off(DAW_EVENTS.PLAYBACK.STOPPED, handlePlaybackStopped);
      eventBus.off(DAW_EVENTS.PLAYBACK.PAUSED, handlePlaybackPaused);
      eventBus.off(DAW_EVENTS.PLAYBACK.POSITION_UPDATE, handlePositionUpdate);
    };
  }, []); 

  useEffect(() => {    
    // Initialize audio engine
    const initAudio = async () => {
      audioEngineRef.current = new AudioEngine();
      await audioEngineRef.current.initialize();
    };
    
    initAudio();
    setInitialized(true);

    // Return cleanup function
    return () => {
      if (audioEngineRef.current) {
        audioEngineRef.current.destroy();
        audioEngineRef.current = null;
      }
    };
  }, []); 

  useEffect(() => {
    if (initialized && track && audioEngineRef.current) {
      const loadTrack = async () => {
        const buffer = await getAudioBufferFromS3(track.combined_audio_url, audioEngineRef.current.context);
        audioEngineRef.current.createTrack(track.id, buffer);
      };
      loadTrack();
      setReady(true);
    }
  }, [initialized, track]);

  const togglePlayPause = () => {
    if (isPlaying) {
      // Emit pause event
      eventBus.emit(DAW_EVENTS.TRANSPORT.PAUSE);
    } else {
      // Emit play event
      eventBus.emit(DAW_EVENTS.TRANSPORT.PLAY);
    }
  };

  return (
    <div className="daw-container">
      <div className="daw-header">
        <h2>DAW</h2>
        <div className="transport-controls">
          <button 
            className="play-pause-btn"
            onClick={togglePlayPause}
            disabled={!ready}
          >
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
          </button>
          <div className="time-display">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>
      
      <div className="daw-body">
        <div className="timeline">
          {/* Timeline content will go here */}
        </div>
        
        <div className="tracks-container">
          {/* Tracks will go here */}
        </div>
      </div>
    </div>
  );
}

// Helper function to format time
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
