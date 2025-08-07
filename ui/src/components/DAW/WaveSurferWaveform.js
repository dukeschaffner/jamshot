'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { eventBus } from './EventBus';
import { DAW_EVENTS } from './DAWEvents';
import { bufferRegistry } from './core/BufferRegistry';
import { useDAW } from './DAWContext';

export default function WaveSurferWaveform({ 
  track,
  height = 100,
  width = '100%',
  waveColor = '#93e9be',
  progressColor = '#007acc',
  cursorColor = '#ff6b6b'
}) {
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState(null);

  const { isPlaying, playheadLocation } = useDAW();

  useEffect(() => {
    if (!waveformRef.current) return;

    // Initialize WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      height: height,
      waveColor: waveColor,
      progressColor: progressColor,
      cursorColor: cursorColor,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      // Disable built-in audio engine since we're using custom engine
      backend: 'MediaElement',
      mediaControls: false,
      autoplay: false,
      interact: true,
      hideScrollbar: true,
      responsive: true,
      normalize: true,
      partialRender: true,
      pixelRatio: 1
    });

    wavesurferRef.current = wavesurfer;

    // Load audio buffer if available
    if (audioBuffer) {
      loadAudioBuffer(audioBuffer);
    }

    // Set up event listeners
    wavesurfer.on('ready', () => {
      setIsReady(true);
    });

    wavesurfer.on('seek', (position) => {
      handleSeek(position * duration);
    });

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (track) {
      const audioBuffer = bufferRegistry.getBuffer(track.regions[0].key);
      setAudioBuffer(audioBuffer);
      setDuration(track.duration);
    }
  }, [track]);

  // Load audio buffer when it changes
  useEffect(() => {
    if (audioBuffer && wavesurferRef.current) {
      loadAudioBuffer(audioBuffer);
    }
  }, [audioBuffer]);

  // Update playhead position when currentTime changes
  useEffect(() => {
    if (wavesurferRef.current && isReady && duration > 0) {
      wavesurferRef.current.setTime(playheadLocation.time);
    }
  }, [playheadLocation.time, duration, isReady]);

  const loadAudioBuffer = async (buffer) => {
    if (!wavesurferRef.current) return;

    try {
      // Convert AudioBuffer to Blob URL for WaveSurfer
      const audioData = buffer.getChannelData(0);
      const sampleRate = buffer.sampleRate;
      
      // Create WAV file from AudioBuffer
      const wavBlob = audioBufferToWav(buffer);
      const audioUrl = URL.createObjectURL(wavBlob);
      
      // Load the audio URL into WaveSurfer
      await wavesurferRef.current.load(audioUrl);
      
      // Clean up the blob URL after loading
      setTimeout(() => {
        URL.revokeObjectURL(audioUrl);
      }, 1000);
    } catch (error) {
      console.error('Error loading audio buffer into WaveSurfer:', error);
    }
  };

  const handleSeek = (newTime) => {
    seek(newTime);
    eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: newTime });
  };

  // Helper function to convert AudioBuffer to WAV Blob
  const audioBufferToWav = (buffer) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    
    // Create WAV file header
    const arrayBuffer = new ArrayBuffer(44 + length * numChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV file header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numChannels * 2, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  return (
    <div className="waveform-container">
      <div 
        ref={waveformRef} 
        style={{ 
          width: width, 
          height: height,
          borderRadius: '6px',
          overflow: 'hidden'
        }}
      />
    </div>
  );
} 