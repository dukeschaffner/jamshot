'use client';

import { useState, useEffect, useRef } from 'react';
import AudioEngine from './core/AudioEngine';
import { eventBus } from './EventBus';
import { DAW_EVENTS } from './DAWEvents';
import { getAudioBufferFromS3 } from './DAWUtils';
import WaveSurferWaveform from './WaveSurferWaveform';
import api from '../../lib/api';
import TransportControls from './components/TransportControls';
import styles from './DAW.module.css';

export default function DAW({ track }) {

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [parentAudioBuffer, setParentAudioBuffer] = useState(null);
  const [duration, setDuration] = useState(0);
  const audioEngineRef = useRef(null);

  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState('4/4');

  const playRecordedRef = useRef(false);

  // Handle track changes
  useEffect(() => {
    if(!track) return;

    const initialBpm = track?.metronome_bpm || 120;
    setMetronomeBpm(initialBpm);
    
    const initialTimeSignature = track?.time_signature || '4/4';
    setTimeSignature(initialTimeSignature);

    playRecordedRef.current = false;
  }, [track]);



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
    
    // Listen for recording events
    const handleRecordingStarted = () => {
      setIsRecording(true);
    };
    
    const handleRecordingStopped = () => {
      setIsRecording(false);
    };
    
    const handleRecordingError = (error) => {
      console.error('Recording error:', error);
      setIsRecording(false);
    };

    const handleBpmChange = (newBpm) => {
      console.log('BPM changed to:', newBpm);
      setMetronomeBpm(newBpm);
    };
    
    const handleTimeSignatureChange = (newTimeSignature) => {
      console.log('Time signature changed to:', newTimeSignature);
      setTimeSignature(newTimeSignature);
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
        
        // Set audio buffer and duration for WaveSurfer
        setParentAudioBuffer(buffer);
        setDuration(buffer.duration);
      };
      loadTrack();
      setReady(true);
    }
  }, [initialized, track]);


  const handleSeek = (newTime) => {
    // Emit seek event to your custom audio engine
    eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: newTime });
  };

  const recordPlay = async () => {
    if (!track || playRecordedRef.current) return;
    
    try {
      playRecordedRef.current = true;
      
      // Get referrer URL for discovery method
      const referrerUrl = document.referrer || null;
      
      const response = await api.post(`/tracks/${track.id}/play`, {
        discovery_method: 'track_page',
        referrer_url: referrerUrl
      });
      
      console.log('Play recorded for track:', track.id);
    } catch (err) {
      console.error('Failed to record initial play:', err);
    }
  };

  return (
    <div className={styles.dawContainer}>
        <TransportControls
          isRecording={isRecording}
          isPlaying={isPlaying}
          ready={ready}
          metronomeBpm={metronomeBpm}
          timeSignature={timeSignature}
        />
        <div className="transport-controls">
          
          <div className="time-display">
            {formatTime(currentTime)}
          </div>
        </div>
      
      <div className={styles.dawBody}>
        <div className="timeline">
          {/* Timeline content will go here */}
        </div>
        
        <div className="tracks-container">
          {parentAudioBuffer && (
            <div>
              <h3 style={{ marginBottom: '12px', color: '#ccc', fontSize: '14px' }}>
                Waveform Display
              </h3>
              <WaveSurferWaveform
                audioBuffer={parentAudioBuffer}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                height={200}
                waveColor="#93e9be"
                progressColor="#007acc"
                cursorColor="#ff6b6b"
              />
            </div>
          )}
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
