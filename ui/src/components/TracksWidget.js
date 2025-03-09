'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDuration, renderWaveform } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faPlay } from '@fortawesome/free-solid-svg-icons';
import './TracksWidget.css';

export default function TracksWidget({ 
  isPlaying,
  setIsPlaying,
  trackDuration,
  showCollabModal,
  isRecording,
  originalAudioChunks = null,
  recordingAudioChunks = null,
  selectedAudioInputDevice = null,
  userLatencyCompensation = 0
}) {
    //#region audio properties
    const [audioContext, setAudioContext] = useState(null);
    const [takes, setTakes] = useState([]);
    const [selectedTake, setSelectedTake] = useState(null);
    const [playheadTime, setPlayheadTime] = useState(0); //Used to scrub and to set playback start time
    const [isLooping, setIsLooping] = useState(true);
    const [looperLeftPos, setLooperLeftPos] = useState(0);
    const [looperRightPos, setLooperRightPos] = useState(100);
    
    // Refs to store audio objects and data
    const originalBufferRef = useRef(null);
    const recordedBufferRef = useRef(null);
    const micStreamRef = useRef(null);
    const recorderRef = useRef(null);
    const isRecordingRef = useRef(false);
    const activeSourcesRef = useRef([]); // Track active audio sources for stopping playback
    const startingPlaybackRef = useRef(false);
    const startingRecordingRef = useRef(false);

    const absoluteRecordingStartTimeRef = useRef(null); // For calculating the latency offset
    const relativeRecordingStartTimeRef = useRef(0); // Tracks when the recording starts relative to the original track

    const absolutePlaybackStartTimeRef = useRef(0);
    //const relativePlaybackStartTimeRef = useRef(0);

    const playheadInternalTimeRef = useRef(0);
    
    //#endregion

    //#region ui properties
    const [playheadPos, setPlayheadPos] = useState(0);
    const [recordingStartPos, setRecordingStartPos] = useState(0);
    const [recordingWidth, setRecordingWidth] = useState(0);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [isDraggingLooperLeft, setIsDraggingLooperLeft] = useState(false);
    const [isDraggingLooperRight, setIsDraggingLooperRight] = useState(false);
    const [isDraggingLooperRegion, setIsDraggingLooperRegion] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [looperStartWidth, setLooperStartWidth] = useState(0);
    const [looperStartLeft, setLooperStartLeft] = useState(0);

    const waveformContainerRef = useRef(null);
    const originalCanvasRef = useRef(null);
    const recordingCanvasRef = useRef(null);
    const playheadRef = useRef(null);
    const playheadIntervalRef = useRef(null);
    const looperRef = useRef(null);
    const looperHandleLeftRef = useRef(null);
    const looperHandleRightRef = useRef(null);
    const looperRegionRef = useRef(null);

    const takesCountRef = useRef(0); // Ref to track the number of takes
    
    //#endregion

    // Helper functions
    const posToTime = (pos, duration) => {
        return (pos / 100) * duration;
    };
    
    const timeToPos = (time, duration) => {
        return (time / duration) * 100;
    };
  

    //#region audio processing


    // Initialize the audio context
    useEffect(() => {
      if (typeof window !== 'undefined') {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          setAudioContext(new AudioContext());
        } catch (e) {
          setStatus('Web Audio API is not supported in this browser');
          console.error('Web Audio API error:', e);
        }
      }
      
      // Cleanup function
      return () => {
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(track => track.stop());
        }
      };
    }, []);
  
    // Sync the isRecording ref with the state
    useEffect(() => {
      isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
      playheadInternalTimeRef.current = playheadTime;
    }, [playheadTime]);

  // Process audio chunks when they change
  useEffect(() => {
    const processAudioChunks = async (chunks, bufferRef) => {
      if (!chunks || chunks.length === 0 || !audioContext) return;
      
      try {
        // Create blob from chunks
        const blob = new Blob(chunks, { type: 'audio/webm' });
        
        // Convert blob to array buffer
        const arrayBuffer = await blob.arrayBuffer();
        
        // Decode audio data
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Store buffer
        bufferRef.current = audioBuffer;
      } catch (error) {
        console.error('Error processing audio chunks:', error);
      }
    };
    
    if (originalAudioChunks) {
      processAudioChunks(originalAudioChunks, originalBufferRef);
    }
    
    // if (recordingAudioChunks) {
    //   processAudioChunks(recordingAudioChunks, recordingBufferRef);
    // }
  }, [originalAudioChunks, recordingAudioChunks]);

  // Play back the recorded audio synchronized with the original track
  const play = () => {
    if (!originalBufferRef.current || !audioContext) {
      return;
    }
    
    // Resume context if needed
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    console.log('playing');
    
    // Create source nodes for both tracks

    
    const trackSource = audioContext.createBufferSource();
    trackSource.buffer = originalBufferRef.current;
    const trackGain = audioContext.createGain();
    trackGain.gain.value = 0.7; // Set volume for backing track
    trackSource.connect(trackGain);
    trackGain.connect(audioContext.destination);

    let activeSources = [trackSource];

    const recordedGain = audioContext.createGain();
    recordedGain.gain.value = 1; // Set volume for recorded audio
    const recordedSource = audioContext.createBufferSource();
    recordedSource.buffer = recordedBufferRef.current;
    recordedSource.connect(recordedGain);
    recordedGain.connect(audioContext.destination);

    if(!isRecording){
      activeSources.push(recordedSource);
    }
    
    // Store active sources for stopping playback
    activeSourcesRef.current = [trackSource, recordedSource];
    
    // Calculate the latency offset in seconds
    const latencyOffset = userLatencyCompensation / 1000; // Convert ms to seconds
    
    // Start playback with latency compensation
    let startTime
    if(isLooping){
        startTime = posToTime(looperLeftPos, trackDuration);
        setPlayheadTime(startTime);
    }
    else{
        startTime = playheadInternalTimeRef.current;
    }
    trackSource.start(0, startTime);
    if(!isRecording){
      recordedSource.start(0,startTime + latencyOffset); // Start recorded audio earlier to compensate
    }
    else{
      relativeRecordingStartTimeRef.current = startTime;
    }

    absolutePlaybackStartTimeRef.current = audioContext.currentTime;

    // Enable the play button when playback is complete
    trackSource.onended = function() {
      if(playheadInternalTimeRef.current + (audioContext.currentTime - absolutePlaybackStartTimeRef.current) > trackDuration - 1){ //Ended naturally, no looping
        playheadInternalTimeRef.current = 0;
        setIsPlaying(false);
        activeSourcesRef.current = [];
      }
      
    };
  };
  
  // Stop playback of all active audio sources
  const pause = () => {
    if (activeSourcesRef.current.length > 0) {
      playheadInternalTimeRef.current = playheadInternalTimeRef.current + (audioContext.currentTime - absolutePlaybackStartTimeRef.current);
      // Stop all active audio sources
      activeSourcesRef.current.forEach(source => {
        try {
          source.stop();
          source.disconnect();
        } catch (error) {
          console.error('Error stopping audio source:', error);
        }
      });
      
      // Clear the active sources array
      activeSourcesRef.current = [];

      setIsPlaying(false);
    }
  };

  const seekToTime = (time) => {
    // Update the playhead position and time
    setPlayheadTime(time);
    setPlayheadPos(timeToPos(time, trackDuration));
    
    // Update the internal time reference
    playheadInternalTimeRef.current = time;
    
    // If currently playing, stop current sources and restart at new position
    if (isPlaying) {
      // Stop all active audio sources
      activeSourcesRef.current.forEach(source => {
        try {
          source.stop();
          source.disconnect();
        } catch (error) {
          console.error('Error stopping audio source:', error);
        }
      });
      
      // Clear the active sources array
      activeSourcesRef.current = [];
      
      // Directly call play to restart at the new position
      // This avoids toggling isPlaying state
      play();
    }
  };
  
  const startRecording = async () => {
    if (!isRecording || !audioContext || !originalBufferRef.current) return;
    
    try {
      // Resume the audio context if it's suspended (important for Chrome)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // Get media stream with selected device and high-quality audio settings
      const constraints = {
        audio: {
          deviceId: selectedAudioInputDevice 
            ? { exact: selectedAudioInputDevice } 
            : undefined,
          // High-quality audio settings
          sampleRate: 48000, // Professional audio sample rate
          sampleSize: 24,    // 24-bit audio (higher quality)
          channelCount: 1,   // Mono recording for simplicity
          echoCancellation: false, // Disable echo cancellation for raw audio
          noiseSuppression: false, // Disable noise suppression for raw audio
          autoGainControl: false   // Disable automatic gain control for raw audio
        }
      };

      // Request microphone access with high-quality settings
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      
      // Create the recorder nodes
      const micSource = audioContext.createMediaStreamSource(stream);
      
      // Use a larger buffer size for better quality (must be power of 2)
      // Larger buffer size = less chance of audio dropouts
      const processorNode = audioContext.createScriptProcessor(8192, 1, 1);
      
      // Create an array to store the recorded data
      const recordedData = [];
      
      // Set up the recording processor - using the ref instead of state
      processorNode.onaudioprocess = function(e) {
        if (isRecordingRef.current) {
          const inputBuffer = e.inputBuffer;
          const channelData = inputBuffer.getChannelData(0);
          
          // Create a copy of the buffer to prevent modification
          const bufferCopy = new Float32Array(channelData.length);
          bufferCopy.set(channelData);
          
          // Store the raw audio data without any processing
          recordedData.push(bufferCopy);
        }
      };
      
      // Connect the microphone directly to the processor
      // This ensures we're capturing the raw microphone input
      micSource.connect(processorNode);
      
      // Connect the processor to the destination (required for ScriptProcessorNode to work)
      // This doesn't affect the recording quality
      processorNode.connect(audioContext.destination);
      
      // Store the recorder components for later use
      recorderRef.current = {
        processorNode,
        recordedData,
        sampleRate: audioContext.sampleRate
      };
      
      // Don't call play() directly here, instead use setIsPlaying
      // This prevents double-playing since the isPlaying useEffect will handle it
      if (!isPlaying) {
        setIsPlaying(true);
      }
      
      // Track start time for synchronization
      recordingStartTimeRef.current = audioContext.currentTime;
      
      isRecordingRef.current = true;
      
      console.log('Recording started with sample rate:', audioContext.sampleRate);
    } catch (e) {
      console.error('Recording error:', e);
    }
  };

  // Helper function to convert AudioBuffer to high-quality WAV format
  const audioBufferToWav = (buffer, sampleRate) => {
    // Use the provided sample rate or default to the buffer's sample rate
    const useSampleRate = sampleRate || buffer.sampleRate;
    
    // High-quality WAV settings
    const numOfChannels = buffer.numberOfChannels;
    const bitsPerSample = 24; // 24-bit for higher quality (CD quality is 16-bit)
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numOfChannels * bytesPerSample;
    const byteRate = useSampleRate * blockAlign;
    const dataSize = buffer.length * numOfChannels * bytesPerSample;
    
    // Create WAV file container
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // RIFF chunk length
    view.setUint32(4, 36 + dataSize, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // Format chunk identifier
    writeString(view, 12, 'fmt ');
    // Format chunk length
    view.setUint32(16, 16, true);
    // Sample format (raw)
    view.setUint16(20, 1, true);
    // Channel count
    view.setUint16(22, numOfChannels, true);
    // Sample rate
    view.setUint32(24, useSampleRate, true);
    // Byte rate (sample rate * block align)
    view.setUint32(28, byteRate, true);
    // Block align (channel count * bytes per sample)
    view.setUint16(32, blockAlign, true);
    // Bits per sample
    view.setUint16(34, bitsPerSample, true);
    // Data chunk identifier
    writeString(view, 36, 'data');
    // Data chunk length
    view.setUint32(40, dataSize, true);
    
    // Write the PCM samples with high precision
    const offset = 44;
    const channelData = [];
    for (let i = 0; i < numOfChannels; i++) {
      channelData.push(buffer.getChannelData(i));
    }
    
    let pos = 0;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numOfChannels; ch++) {
        // Clamp the value to the -1 to 1 range
        const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        
        // For 24-bit audio, we need to write 3 bytes
        if (bitsPerSample === 24) {
          // Convert to 24-bit signed integer
          const value = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
          const intValue = Math.floor(value);
          
          // Write the 3 bytes (little-endian)
          view.setUint8(offset + pos, intValue & 0xFF);
          view.setUint8(offset + pos + 1, (intValue >> 8) & 0xFF);
          view.setUint8(offset + pos + 2, (intValue >> 16) & 0xFF);
          pos += 3;
        } else {
          // Fallback to 16-bit if needed
          const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          view.setInt16(offset + pos, value, true);
          pos += 2;
        }
      }
    }
    
    return arrayBuffer;
  };
  
  // Helper function to write strings to DataView
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Function to create a new take from the recorded buffer
  const createTakeFromRecordedBuffer = () => {
    if (!recordedBufferRef.current) {
      console.error('No recorded buffer available');
      return;
    }
    
    try {
      // Get the recorded buffer
      const recordedBuffer = recordedBufferRef.current;
      
      // Convert to high-quality WAV format
      const wavArrayBuffer = audioBufferToWav(
        recordedBuffer, 
        recorderRef.current?.sampleRate || audioContext.sampleRate
      );
      
      // Create a take with the high-quality WAV data
      const takeNumber = takes.length + 1;
      const newTake = {
        id: Date.now().toString(),
        name: `Take ${takeNumber}`,
        chunks: [new Uint8Array(wavArrayBuffer)],
        recordedAt: Date.now(),
        startTime: relativeRecordingStartTimeRef.current,
        endTime: relativeRecordingStartTimeRef.current + recordedBuffer.duration,
        mimeType: 'audio/wav',
        sampleRate: recorderRef.current?.sampleRate || audioContext.sampleRate,
        bitDepth: 24 // Store the bit depth for reference
      };
      
      // Add the new take to the takes list
      setTakes(prevTakes => [...prevTakes, newTake]);
      
      // Set the new take as the selected take
      setSelectedTake(newTake);
      
      console.log('Created high-quality take with sample rate:', newTake.sampleRate, 'and bit depth:', newTake.bitDepth);
    } catch (error) {
      console.error('Error creating take from recorded buffer:', error);
    }
  };

  // Update the stopRecording function to create a take
  const stopRecording = () => {
    if (isRecording || !audioContext) return;
    
    isRecordingRef.current = false;
    
    // Stop the playback
    pause();
    
    // Stop the recording
    if (recorderRef.current && recorderRef.current.processorNode) {
      try {
        recorderRef.current.processorNode.disconnect();
      } catch (e) {
        console.error('Error disconnecting processor node:', e);
      }
    }
    
    // Stop the microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    
    // Create a buffer from the recorded data
    if (recorderRef.current && recorderRef.current.recordedData && recorderRef.current.recordedData.length > 0) {
      const recordedData = recorderRef.current.recordedData;
      console.log(`Recorded ${recordedData.length} chunks of audio data`);
      
      const recordedLength = recordedData.reduce((acc, buffer) => acc + buffer.length, 0);
      console.log(`Total recorded samples: ${recordedLength}`);
      
      // Create a single buffer to hold all the recorded data
      const mergedBuffer = new Float32Array(recordedLength);
      
      // Merge all chunks into a single buffer without any processing
      let offset = 0;
      for (const buffer of recordedData) {
        mergedBuffer.set(buffer, offset);
        offset += buffer.length;
      }
      
      // Create an AudioBuffer with the same duration as the recording
      // Use the exact sample rate that was used during recording
      const recordedBuffer = audioContext.createBuffer(
        1, // Mono channel
        mergedBuffer.length,
        recorderRef.current.sampleRate || audioContext.sampleRate
      );
      
      // Fill the buffer with the raw recorded data without any processing
      recordedBuffer.getChannelData(0).set(mergedBuffer);
      
      // Store the buffer for playback
      recordedBufferRef.current = recordedBuffer;
      
      console.log('Recording completed and processed at sample rate:', 
                 recorderRef.current.sampleRate || audioContext.sampleRate);
      
      // Create a take from the recorded buffer
      createTakeFromRecordedBuffer();
    } else {
      console.error('No recorded data available', recorderRef.current);
    }
  };

  useEffect(() => {
    if (isPlaying && !startingPlaybackRef.current) {
      startingPlaybackRef.current = true;
      play();
    } else {
      pause();
      startingPlaybackRef.current = false;
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isRecording && !startingRecordingRef.current) {
      startingRecordingRef.current = true;
      startRecording();
    }
    else{
      stopRecording();
      startingRecordingRef.current = false;
    }
  }, [isRecording]);

  //#endregion
  

  //#region ui rendering
  // Render waveforms when buffers change
  useEffect(() => {
    if (originalBufferRef.current) {
      renderWaveform(originalBufferRef.current, originalCanvasRef);
    }
    
    if (recordedBufferRef.current) {
      renderWaveform(recordedBufferRef.current, recordingCanvasRef);
    }
  }, [originalBufferRef.current, recordedBufferRef.current]);

  // Update playhead position when playback starts
  useEffect(() => {
    if (isPlaying) {
      const updatePlayhead = () => {
        if (playheadRef.current) {
          const currentTime = playheadInternalTimeRef.current + (audioContext.currentTime - absolutePlaybackStartTimeRef.current);
          const playheadPos = timeToPos(currentTime, trackDuration);
          if(isLooping && playheadPos >= looperRightPos){ //Go to the start of the looper
            seekToTime(posToTime(looperLeftPos, trackDuration));
          }
          else{
            setPlayheadPos(playheadPos);
          }
          
          
        }
      };
      
      updatePlayhead();
      
      playheadIntervalRef.current = setInterval(updatePlayhead, 20);
      
      return () => {
        clearInterval(playheadIntervalRef.current);
      };
    }
  }, [isPlaying]);



    // Handle waveform click
    const handleWaveformClick = (e) => {
        if (!waveformContainerRef.current || isRecording) return; //
        
        const rect = waveformContainerRef.current.getBoundingClientRect();
        const clickPos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        seekToTime(posToTime(clickPos, trackDuration));
    };

      // Mouse down handlers for dragging
//   const handlePlayheadMouseDown = (e) => {
//     e.stopPropagation();
//     setIsDraggingPlayhead(true);
//   };
  
  const handleLooperLeftMouseDown = (e) => {
    e.stopPropagation();
    if(isPlaying) {return;}
    setIsDraggingLooperLeft(true);
  };

  const handleLooperRightMouseDown = (e) => {
    e.stopPropagation();
    if(isPlaying) {return;}
    setIsDraggingLooperRight(true);
  };
  
  const handleLooperRegionMouseDown = (e) => {
    e.stopPropagation();
    if(isPlaying) {return;}
    setIsDraggingLooperRegion(true);
    setDragStartX(e.clientX);
    setLooperStartLeft(looperLeftPos);
    // Store the width of the looper region
    setLooperStartWidth(looperRightPos - looperLeftPos);
  };

  useEffect(() => {
    if(selectedTake){
      const startPos = timeToPos(selectedTake.startTime, trackDuration);
      setRecordingStartPos(startPos);
      const width = timeToPos(selectedTake.endTime - selectedTake.startTime, trackDuration);
      setRecordingWidth(width);
    }
  }, [selectedTake]);

    // Mouse event handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
          if (!isDraggingLooperLeft && !isDraggingLooperRight && !isDraggingPlayhead && !isDraggingLooperRegion) return;
          
          if (waveformContainerRef.current) {
            const rect = waveformContainerRef.current.getBoundingClientRect();
            const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            
            // Dragging playhead
            // if (isDraggingPlayhead) {
            //   setPlayheadPos(mousePos);
              
            //   // Update audio position if playing
            //   if (isPlaying && audioContextRef.current) {
            //     pausedAtRef.current = posToTime(mousePos, trackDuration);
            //   }
              
            //   // Show time tooltip
            //   const time = posToTime(mousePos, trackDuration);
            //   showTimeTooltip(playheadRef.current, mousePos, formatDuration(time));
            // }
            
            // Dragging left looper handle
            if (isDraggingLooperLeft) {
              const newLeftPos = Math.max(0, Math.min(looperRightPos - 5, mousePos));
              setLooperLeftPos(newLeftPos);
              
              // If playhead is to the left of the new left position and audio is playing,
              // move the playhead to the new left position
            //   if (playheadPos < newLeftPos && isPlaying) {
            //     setPlayheadPos(newLeftPos);
            //     pausedAtRef.current = posToTime(newLeftPos, trackDuration);
            //   }
              
              // Show time tooltip
            //   const time = posToTime(newLeftPos, trackDuration);
            //   showTimeTooltip(looperHandleLeftRef.current, newLeftPos, formatDuration(time));
            }
            
            // Dragging right looper handle
            if (isDraggingLooperRight) {
              const newRightPos = Math.max(looperLeftPos + 5, Math.min(100, mousePos));
              setLooperRightPos(newRightPos);
              
              // Show time tooltip
            //   const time = posToTime(newRightPos, trackDuration);
            //   showTimeTooltip(looperHandleRightRef.current, newRightPos, formatDuration(time));
            }
            
            // Dragging entire looper region
            if (isDraggingLooperRegion) {
              const deltaX = e.clientX - dragStartX;
              const deltaPercent = (deltaX / rect.width) * 100;
              
              // Calculate new positions
              let newLeftPos = looperStartLeft + deltaPercent;
              let newRightPos = newLeftPos + looperStartWidth;
              
              // Ensure the looper stays within bounds
              if (newLeftPos < 0) {
                newLeftPos = 0;
                newRightPos = looperStartWidth;
              }
              
              if (newRightPos > 100) {
                newRightPos = 100;
                newLeftPos = 100 - looperStartWidth;
              }
              
              // Update looper positions
              setLooperLeftPos(newLeftPos);
              setLooperRightPos(newRightPos);
              
              // If playhead is outside the new looper region and audio is playing,
              // move the playhead to the new left position
            //   if (isPlaying && isLooping) {
            //     if (playheadPos < newLeftPos || playheadPos > newRightPos) {
            //       setPlayheadPos(newLeftPos);
            //       pausedAtRef.current = posToTime(newLeftPos, trackDuration);
            //     }
            //   }
              
              // Show tooltip with start and end times
            //   const looperStartTime = posToTime(newLeftPos, trackDuration);
            //   const looperEndTime = posToTime(newRightPos, trackDuration);
            //   showTimeTooltip(
            //     looperRegionRef.current, 
            //     (newLeftPos + newRightPos) / 2, 
            //     `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
            //   );
            }
          }
        };
        
        const handleMouseUp = () => {
          setIsDraggingLooperLeft(false);
          setIsDraggingLooperRight(false);
          setIsDraggingPlayhead(false);
          setIsDraggingLooperRegion(false);
          //hideTimeTooltip();
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }, [
        isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion,
        looperLeftPos, looperRightPos, dragStartX, looperStartLeft, looperStartWidth,
        isPlaying, playheadPos, isLooping, trackDuration
      ]);

      useEffect(() => {
        // Update visual elements based on state
        const updateVisuals = () => {
            if (looperRef.current) {
                const looperWidth = looperRightPos - looperLeftPos;
                looperRef.current.style.left = `${looperLeftPos}%`;
                looperRef.current.style.width = `${looperWidth}%`;
            }
            
            if (looperRegionRef.current) {
                if (isLooping) {
                    looperRegionRef.current.style.backgroundColor = 'rgba(147, 233, 190, 0.4)';
                    if (looperHandleLeftRef.current) looperHandleLeftRef.current.style.backgroundColor = 'var(--seafoam)';
                    if (looperHandleRightRef.current) looperHandleRightRef.current.style.backgroundColor = 'var(--seafoam)';
                } else {
                    looperRegionRef.current.style.backgroundColor = 'rgba(147, 233, 190, 0.1)';
                    if (looperHandleLeftRef.current) looperHandleLeftRef.current.style.backgroundColor = 'var(--gray)';
                    if (looperHandleRightRef.current) looperHandleRightRef.current.style.backgroundColor = 'var(--gray)';
                }
            }
            
            // Update time tooltips if dragging
            // if (isDraggingLooperLeft && looperHandleLeftRef.current) {
            // showTimeTooltip(looperHandleLeftRef.current, looperLeftPos);
            // } else if (isDraggingLooperRight && looperHandleRightRef.current) {
            // showTimeTooltip(looperHandleRightRef.current, looperRightPos);
            // } else if (isDraggingPlayhead && playheadRef.current) {
            // showTimeTooltip(playheadRef.current, playheadPos);
            // } else if (isDraggingLooperRegion && looperRegionRef.current) {
            // const looperStartTime = posToTime(looperLeftPos, trackDuration);
            // const looperEndTime = posToTime(looperRightPos, trackDuration);
            // showTimeTooltip(
            //     looperRegionRef.current, 
            //     (looperLeftPos + looperRightPos) / 2, 
            //     `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
            // );
            // }
        };
        updateVisuals();

    }, [looperLeftPos, looperRightPos, isLooping]);


  
  

  
  // Determine if recording track has content
  const hasRecordingTrack = recordedBufferRef.current !== null || selectedTake !== null;
  
  return (
    <div className="daw-container">
      {/* Timeline */}
      <div className="timeline">
        <div className="track-label"></div>
        <div className="time-markers">
          <div className="time-marker" style={{ left: '0%' }}>0:00</div>
          <div className="time-marker" style={{ left: '16.67%' }}>0:15</div>
          <div className="time-marker" style={{ left: '33.33%' }}>0:30</div>
          <div className="time-marker" style={{ left: '50%' }}>0:45</div>
          <div className="time-marker" style={{ left: '66.67%' }}>1:00</div>
          <div className="time-marker" style={{ left: '83.33%' }}>1:15</div>
          <div className="time-marker" style={{ left: '100%' }}>1:30</div>
        </div>
      </div>

      {/* Parent Track */}
      <div className="track-container parent-track">
        <div className="track-label">
          <span>Original</span>
        </div>
        <div className="waveform-container" ref={waveformContainerRef} onClick={handleWaveformClick}>
          <div className="waveform">
            {/* Canvas Waveform */}
            {originalBufferRef.current ? (
              <canvas 
                ref={originalCanvasRef} 
                width="1000" 
                height="100" 
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              /* SVG Waveform Fallback */
              <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
                <path 
                  d="M0,50 Q10,40 20,50 T40,50 T60,50 T80,30 T100,50 T120,60 T140,50 T160,40 T180,50 T200,70 T220,50 T240,30 T260,50 T280,60 T300,50 T320,40 T340,50 T360,60 T380,50 T400,30 T420,50 T440,70 T460,50 T480,30 T500,50 T520,60 T540,50 T560,40 T580,50 T600,70 T620,50 T640,30 T660,50 T680,60 T700,50 T720,40 T740,50 T760,60 T780,50 T800,30 T820,50 T840,70 T860,50 T880,30 T900,50 T920,60 T940,50 T960,40 T980,50 T1000,50" 
                  fill="none" 
                  stroke="var(--seafoam)" 
                  strokeWidth="2"
                />
              </svg>
            )}
            {/* Playhead */}
            <div 
              className="playhead" 
              ref={playheadRef}
              style={{ left: `${playheadPos}%` }}
            ></div>
          </div>
          {/* Looper */}
          <div 
            className="looper" 
            ref={looperRef}
            style={{ left: `${looperLeftPos}%`, width: `${looperRightPos - looperLeftPos}%` }}
          >
            <div 
              className="looper-handle left" 
              ref={looperHandleLeftRef}
              onMouseDown={handleLooperLeftMouseDown}
            ></div>
            <div 
              className="looper-region" 
              ref={looperRegionRef}
              onClick={(e) => {
                e.stopPropagation();
                setIsLooping(prev => !prev);
              }}
              onMouseDown={handleLooperRegionMouseDown}
            ></div>
            <div 
              className="looper-handle right" 
              ref={looperHandleRightRef}
              onMouseDown={handleLooperRightMouseDown}
            ></div>
          </div>
        </div>
      </div>

      {/* Your Recording */}
      <div className="track-container your-track">
        <div className="track-label">
          <span>Your Recording</span>
        </div>
        {hasRecordingTrack ? (
          <div className="waveform-container"
          style={{
            left: `${recordingStartPos}%`,
            width: `${recordingWidth}%`,
          }}
          onClick={handleWaveformClick}
          >
            <div className="waveform">
              <canvas 
                ref={recordingCanvasRef} 
                width="1000" 
                height="100" 
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        ) : (
          <div 
            className="waveform-container empty"
            onClick={showCollabModal}
          >
            <div className="empty-message">
              <FontAwesomeIcon icon={faMicrophone} />
              <span>Record your collaboration</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Takes List */}
      {takes.length > 0 && (
        <div className="takes-container">
          <h3>Your Takes</h3>
          <div className="takes-list">
            {takes.map(take => (
              <div 
                key={take.id} 
                className={`take-item ${selectedTake?.id === take.id ? 'selected' : ''}`}
                onClick={() => setSelectedTake(take)}
              >
                <span className="take-name">{take.name}</span>
                <div className="take-controls">
                  <button className="take-play" onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTake(take);
                    setIsPlaying(true);
                  }}>
                    <FontAwesomeIcon icon={faPlay} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 