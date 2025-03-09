'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDuration } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faPlay } from '@fortawesome/free-solid-svg-icons';
import './TracksWidget.css';

export default function TracksWidget({ 
  track,
  isPlaying,
  setIsPlaying,
  showCollabModal,
  isRecording,
  originalAudioChunks = null,
  recordingAudioChunks = null,
  selectedAudioInputDevice = null,
  setRecordingAudioChunks = null,
  userLatencyCompensation = 0
}) {
  // Internal state
  const [isLooping, setIsLooping] = useState(true);
  const [playheadPos, setPlayheadPos] = useState(0);
  const [looperLeftPos, setLooperLeftPos] = useState(0);
  const [looperRightPos, setLooperRightPos] = useState(100);
  const [takes, setTakes] = useState([]);
  const [selectedTake, setSelectedTake] = useState(null);
  
  // Track duration in seconds (default to 90 seconds if not available)
  const trackDuration = track?.duration || 90;
  
  // Helper functions
  const posToTime = (pos, duration) => {
    return (pos / 100) * duration;
  };
  
  const timeToPos = (time, duration) => {
    return (time / duration) * 100;
  };
  
  // State for dragging
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingLooperLeft, setIsDraggingLooperLeft] = useState(false);
  const [isDraggingLooperRight, setIsDraggingLooperRight] = useState(false);
  const [isDraggingLooperRegion, setIsDraggingLooperRegion] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [looperStartWidth, setLooperStartWidth] = useState(0);
  const [looperStartLeft, setLooperStartLeft] = useState(0);
  
  // Web Audio API refs
  const audioContextRef = useRef(null);
  const originalSourceNodeRef = useRef(null);
  const recordingSourceNodeRef = useRef(null);
  const originalGainNodeRef = useRef(null);
  const recordingGainNodeRef = useRef(null);
  const originalBufferRef = useRef(null);
  const recordingBufferRef = useRef(null);
  const startTimeRef = useRef(0);
  
  const playheadIntervalRef = useRef(null);
  const lastUpdateTimeRef = useRef(0); // Track last update time
  const recordingStartTimeRef = useRef(0); // Track when recording starts
  const playbackStartTimeRef = useRef(0); // Track when playback starts
  
  // Refs
  const waveformContainerRef = useRef(null);
  const playheadRef = useRef(null);
  const looperRef = useRef(null);
  const looperHandleLeftRef = useRef(null);
  const looperHandleRightRef = useRef(null);
  const looperRegionRef = useRef(null);
  
  // Media recorder refs
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const takesCountRef = useRef(0); // Ref to track the number of takes
  
  // Canvas refs for waveform visualization
  const originalCanvasRef = useRef(null);
  const recordingCanvasRef = useRef(null);
  
  // Update takesCountRef when takes change
  useEffect(() => {
    takesCountRef.current = takes.length;
  }, [takes]);
  
  // Initialize Web Audio API
  useEffect(() => {
    // Create AudioContext
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 48000,
          latencyHint: 'interactive'
        });
      } catch (error) {
        console.error('Error creating AudioContext:', error);
        // Fallback to default constructor
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
    }
    
    // Resume audio context if suspended
    const resumeAudioContext = async () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          console.error('Error resuming AudioContext:', error);
        }
      }
    };
    
    resumeAudioContext();
    
    // Create gain nodes
    if (!originalGainNodeRef.current) {
      originalGainNodeRef.current = audioContextRef.current.createGain();
      originalGainNodeRef.current.connect(audioContextRef.current.destination);
    }
    
    if (!recordingGainNodeRef.current) {
      recordingGainNodeRef.current = audioContextRef.current.createGain();
      recordingGainNodeRef.current.connect(audioContextRef.current.destination);
    }
    
    return () => {
      // Clean up
      if (originalSourceNodeRef.current) {
        originalSourceNodeRef.current.stop();
        originalSourceNodeRef.current.disconnect();
      }
      
      if (recordingSourceNodeRef.current) {
        recordingSourceNodeRef.current.stop();
        recordingSourceNodeRef.current.disconnect();
      }
    };
  }, []);
  
  // Process audio chunks when they change
  useEffect(() => {
    const processAudioChunks = async (chunks, bufferRef, sourceNodeRef, gainNodeRef) => {
      if (!chunks || chunks.length === 0 || !audioContextRef.current) return;
      
      try {
        // Create blob from chunks
        const blob = new Blob(chunks, { type: 'audio/webm' });
        
        // Convert blob to array buffer
        const arrayBuffer = await blob.arrayBuffer();
        
        // Decode audio data
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // Store buffer
        bufferRef.current = audioBuffer;
      } catch (error) {
        console.error('Error processing audio chunks:', error);
      }
    };
    
    if (originalAudioChunks) {
      processAudioChunks(originalAudioChunks, originalBufferRef, originalSourceNodeRef, originalGainNodeRef);
    }
    
    if (recordingAudioChunks) {
      processAudioChunks(recordingAudioChunks, recordingBufferRef, recordingSourceNodeRef, recordingGainNodeRef);
    }
  }, [originalAudioChunks, recordingAudioChunks]);
  
  // Handle play/pause with Web Audio API
  useEffect(() => {
    const playAudio = () => {
      if (!audioContextRef.current) return;
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      // Calculate start position
      let loopStartTime;
      if(isLooping){
        loopStartTime = posToTime(looperLeftPos, trackDuration);
      }
      else{
        if(pausedAtRef.current > trackDuration - 1){
          pausedAtRef.current = 0;
          loopStartTime = 0;
        }
        else{
          loopStartTime = pausedAtRef.current;
        }
      }

      // Play original track if buffer exists
      if (originalBufferRef.current) {
        // Stop previous source if exists
        if (originalSourceNodeRef.current) {
          originalSourceNodeRef.current.stop();
          originalSourceNodeRef.current.disconnect();
        }
        
        // Create new source
        originalSourceNodeRef.current = audioContextRef.current.createBufferSource();
        originalSourceNodeRef.current.buffer = originalBufferRef.current;
        originalSourceNodeRef.current.connect(originalGainNodeRef.current);
        
        // Record the exact time when playback starts
        playbackStartTimeRef.current = performance.now();
        
        // Start playback
        originalSourceNodeRef.current.start(0, loopStartTime);
        console.log("playback started at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));
        
        // Set up ended event
        originalSourceNodeRef.current.onended = () => {
          if (!isLooping) {
            setIsPlaying(false);
          }
        };
      }
      
      // Play recording track if buffer exists
      if (recordingBufferRef.current && !isRecording) {
        // Stop previous source if exists
        if (recordingSourceNodeRef.current) {
          recordingSourceNodeRef.current.stop();
          recordingSourceNodeRef.current.disconnect();
        }
        
        // Create new source
        recordingSourceNodeRef.current = audioContextRef.current.createBufferSource();
        recordingSourceNodeRef.current.buffer = recordingBufferRef.current;
        recordingSourceNodeRef.current.connect(recordingGainNodeRef.current);
        
        // Apply latency compensation if available in the selected take
        let adjustedStartTime = loopStartTime;
        if (selectedTake) {
          // Apply both the take's latency compensation and the user's latency compensation
          const takeLatencyCompensation = selectedTake.latencyCompensation || 0;
          const totalCompensationMs = takeLatencyCompensation + userLatencyCompensation;
          const compensationInSeconds = totalCompensationMs / 1000;
          
          adjustedStartTime = Math.max(0, loopStartTime - compensationInSeconds);
          console.log("Applying total latency compensation:", totalCompensationMs, "ms", 
            "(take:", selectedTake.latencyCompensation || 0, "ms, user:", userLatencyCompensation, "ms)");
        }
        
        // Start playback at the adjusted time for sync
        recordingSourceNodeRef.current.start(0, adjustedStartTime);
      }
      
      // Store start time for tracking playhead position
      startTimeRef.current = audioContextRef.current.currentTime - loopStartTime;
      lastUpdateTimeRef.current = 0; // Reset last update time
    };
    
    const pauseAudio = () => {
      // Store current position
      if (audioContextRef.current && !isPlaying) {
        pausedAtRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      }
      
      // Stop sources
      if (originalSourceNodeRef.current) {
        originalSourceNodeRef.current.stop();
        originalSourceNodeRef.current.disconnect();
        originalSourceNodeRef.current = null;
      }
      
      if (recordingSourceNodeRef.current) {
        recordingSourceNodeRef.current.stop();
        recordingSourceNodeRef.current.disconnect();
        recordingSourceNodeRef.current = null;
      }
    };
    
    // Handle play/pause
    if (isPlaying) {
      playAudio();
      
      // Clear any existing interval
      if (playheadIntervalRef.current) {
        clearInterval(playheadIntervalRef.current);
      }
      
      // We'll use a very infrequent interval just to check for looping
      // This won't update the UI directly
      playheadIntervalRef.current = setInterval(() => {
        if (!audioContextRef.current) return;
        
        // Calculate current position
        const currentTime = audioContextRef.current.currentTime - startTimeRef.current;
        const percent = timeToPos(currentTime, trackDuration);
        
        // Check if we need to loop
        if (isLooping && percent >= looperRightPos) {
          // Reset to loop start
          const loopStartTime = posToTime(looperLeftPos, trackDuration);
          startTimeRef.current = audioContextRef.current.currentTime - loopStartTime;
          pausedAtRef.current = loopStartTime;
          
          // Update playhead position
          if (playheadRef.current) {
            playheadRef.current.style.left = `${looperLeftPos}%`;
          }
          
          // Restart playback
          playAudio();
        } else if (!isDraggingPlayhead) {
          // Only update DOM directly if significant time has passed (250ms)
          // This reduces the frequency of DOM updates
          const now = Date.now();
          if (now - lastUpdateTimeRef.current > 20) {
            lastUpdateTimeRef.current = now;
            
            // Update playhead position directly in the DOM
            if (playheadRef.current) {
              playheadRef.current.style.left = `${percent}%`;
            }
          }
        }
      }, 20); // Check every 20ms
    } else {
      pauseAudio();
      
      // Clear interval when paused
      if (playheadIntervalRef.current) {
        clearInterval(playheadIntervalRef.current);
        playheadIntervalRef.current = null;
      }
    }
    
    // Clean up interval only when dependencies change
    return () => {
      // Clear interval on cleanup
      if (playheadIntervalRef.current) {
        clearInterval(playheadIntervalRef.current);
        playheadIntervalRef.current = null;
      }
    };
  }, [isPlaying, isLooping, looperLeftPos, looperRightPos, playheadPos, trackDuration, setIsPlaying]);
  
  // Add a separate useEffect for component unmount only
  useEffect(() => {
    // This cleanup function will only run when the component unmounts
    return () => {
      // Pause audio only when component unmounts
      if (audioContextRef.current) {
        
        // Stop sources
        if (originalSourceNodeRef.current) {
          originalSourceNodeRef.current.stop();
          originalSourceNodeRef.current.disconnect();
          originalSourceNodeRef.current = null;
        }
        
        if (recordingSourceNodeRef.current) {
          recordingSourceNodeRef.current.stop();
          recordingSourceNodeRef.current.disconnect();
          recordingSourceNodeRef.current = null;
        }
      }
    };
  }, []); // Empty dependency array means this only runs on mount/unmount
  
  // Show time tooltip
  const showTimeTooltip = (element, position, customText) => {
    if (!element) return;
    
    let tooltip = document.querySelector('.time-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'time-tooltip';
      document.body.appendChild(tooltip);
    }
    
    const time = customText || formatDuration(posToTime(position, trackDuration));
    tooltip.textContent = time;
    
    if (waveformContainerRef.current) {
      const rect = waveformContainerRef.current.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      
      // Position tooltip above the element
      const tooltipLeft = rect.left + (position / 100) * rect.width;
      tooltip.style.left = `${tooltipLeft}px`;
      tooltip.style.top = `${elementRect.top - 25}px`;
      tooltip.style.display = 'block';
    }
  };
  
  // Hide time tooltip
  const hideTimeTooltip = () => {
    const tooltip = document.querySelector('.time-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  };
  
  // Update visual elements based on state
  const updateVisuals = () => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${playheadPos}%`;
    }
    
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
    if (isDraggingLooperLeft && looperHandleLeftRef.current) {
      showTimeTooltip(looperHandleLeftRef.current, looperLeftPos);
    } else if (isDraggingLooperRight && looperHandleRightRef.current) {
      showTimeTooltip(looperHandleRightRef.current, looperRightPos);
    } else if (isDraggingPlayhead && playheadRef.current) {
      showTimeTooltip(playheadRef.current, playheadPos);
    } else if (isDraggingLooperRegion && looperRegionRef.current) {
      const looperStartTime = posToTime(looperLeftPos, trackDuration);
      const looperEndTime = posToTime(looperRightPos, trackDuration);
      showTimeTooltip(
        looperRegionRef.current, 
        (looperLeftPos + looperRightPos) / 2, 
        `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
      );
    }
  };
  
  // Handle waveform click
  const handleWaveformClick = (e) => {
    if (!waveformContainerRef.current) return;
    
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const clickPos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    
    // Update playhead position
    setPlayheadPos(clickPos);
    pausedAtRef.current = posToTime(clickPos, trackDuration);
  };
  
  // Mouse down handlers for dragging
  const handlePlayheadMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
  };
  
  const handleLooperLeftMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingLooperLeft(true);
  };
  
  const handleLooperRightMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingLooperRight(true);
  };
  
  const handleLooperRegionMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingLooperRegion(true);
    setDragStartX(e.clientX);
    setLooperStartLeft(looperLeftPos);
    // Store the width of the looper region
    setLooperStartWidth(looperRightPos - looperLeftPos);
  };
  
  // Update visuals when state changes
  useEffect(() => {
    updateVisuals();
  }, [
    playheadPos, looperLeftPos, looperRightPos, isLooping,
    isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion
  ]);
  
  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingLooperLeft && !isDraggingLooperRight && !isDraggingPlayhead && !isDraggingLooperRegion) return;
      
      if (waveformContainerRef.current) {
        const rect = waveformContainerRef.current.getBoundingClientRect();
        const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        // Dragging playhead
        if (isDraggingPlayhead) {
          setPlayheadPos(mousePos);
          
          // Update audio position if playing
          if (isPlaying && audioContextRef.current) {
            pausedAtRef.current = posToTime(mousePos, trackDuration);
          }
          
          // Show time tooltip
          const time = posToTime(mousePos, trackDuration);
          showTimeTooltip(playheadRef.current, mousePos, formatDuration(time));
        }
        
        // Dragging left looper handle
        if (isDraggingLooperLeft) {
          const newLeftPos = Math.max(0, Math.min(looperRightPos - 5, mousePos));
          setLooperLeftPos(newLeftPos);
          
          // If playhead is to the left of the new left position and audio is playing,
          // move the playhead to the new left position
          if (playheadPos < newLeftPos && isPlaying) {
            setPlayheadPos(newLeftPos);
            pausedAtRef.current = posToTime(newLeftPos, trackDuration);
          }
          
          // Show time tooltip
          const time = posToTime(newLeftPos, trackDuration);
          showTimeTooltip(looperHandleLeftRef.current, newLeftPos, formatDuration(time));
        }
        
        // Dragging right looper handle
        if (isDraggingLooperRight) {
          const newRightPos = Math.max(looperLeftPos + 5, Math.min(100, mousePos));
          setLooperRightPos(newRightPos);
          
          // Show time tooltip
          const time = posToTime(newRightPos, trackDuration);
          showTimeTooltip(looperHandleRightRef.current, newRightPos, formatDuration(time));
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
          if (isPlaying && isLooping) {
            if (playheadPos < newLeftPos || playheadPos > newRightPos) {
              setPlayheadPos(newLeftPos);
              pausedAtRef.current = posToTime(newLeftPos, trackDuration);
            }
          }
          
          // Show tooltip with start and end times
          const looperStartTime = posToTime(newLeftPos, trackDuration);
          const looperEndTime = posToTime(newRightPos, trackDuration);
          showTimeTooltip(
            looperRegionRef.current, 
            (newLeftPos + newRightPos) / 2, 
            `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
          );
        }
      }
    };
    
    const handleMouseUp = () => {
      setIsDraggingLooperLeft(false);
      setIsDraggingLooperRight(false);
      setIsDraggingPlayhead(false);
      setIsDraggingLooperRegion(false);
      hideTimeTooltip();
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

  
  
  // Render waveforms when buffers change
  useEffect(() => {
    if (originalBufferRef.current) {
      renderWaveform(originalBufferRef.current, originalCanvasRef);
    }
    
    if (recordingBufferRef.current) {
      renderWaveform(recordingBufferRef.current, recordingCanvasRef);
    }
  }, [originalBufferRef.current, recordingBufferRef.current]);
  
  // Handle recording state changes
  useEffect(() => {
    let cleanup = () => {};
    
    if (isRecording) {
      const startRecording = async () => {
        try {
          // Stop any existing stream
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
          }
          
          // Get media stream with selected device or default
          const constraints = {
            audio: {
              deviceId: selectedAudioInputDevice 
                ? { exact: selectedAudioInputDevice } 
                : undefined,
              sampleRate: 48000,
              channelCount: 2,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          };
          
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          mediaStreamRef.current = stream;
          
          // Check for supported MIME types
          let mimeType = 'audio/webm;codecs=opus';
          let options = {
            audioBitsPerSecond: 256000
          };
          
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            // Fallback to other formats
            if (MediaRecorder.isTypeSupported('audio/webm')) {
              mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
              mimeType = 'audio/mp4';
            } else {
              // Use default
              mimeType = '';
            }
          }
          
          if (mimeType) {
            options.mimeType = mimeType;
          }
          
          // Create media recorder with high quality settings
          const mediaRecorder = new MediaRecorder(stream, options);
          mediaRecorderRef.current = mediaRecorder;
          
          // Clear previous chunks
          recordedChunksRef.current = [];
          
          // Set up event handlers
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          
          mediaRecorder.onstop = async () => {
            try {
              if(recordedChunksRef.current.length == 0) return;
              // Create blob from recorded chunks with the correct MIME type
              const blob = new Blob(recordedChunksRef.current, { 
                type: mediaRecorder.mimeType || options.mimeType || 'audio/webm' 
              });
              
              // Convert blob to array buffer
              const arrayBuffer = await blob.arrayBuffer();
              
              // Create Uint8Array chunks
              const chunks = [new Uint8Array(arrayBuffer)];
              
              // Calculate latency compensation (difference between recording start and playback start)
              const latencyCompensation = playbackStartTimeRef.current - recordingStartTimeRef.current;
              console.log("Latency compensation:", latencyCompensation, "ms");
              
              // Create a new take
              const takeNumber = takesCountRef.current + 1;
              const newTake = {
                id: Date.now().toString(),
                name: `Take ${takeNumber}`,
                chunks: chunks,
                recordedAt: Date.now(),
                mimeType: mediaRecorder.mimeType || options.mimeType || 'audio/webm',
                latencyCompensation
              };
              
              // Add the new take to the takes list
              setTakes(prevTakes => [...prevTakes, newTake]);
              
              // Set the new take as the selected take
              setSelectedTake(newTake);
              
            } catch (error) {
              console.error('Error processing recorded audio chunks:', error);
            }
          };
          
          // Start recording
          mediaRecorder.start(1000); // Collect data every second
          console.log("recording started at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));
          
          // Record the exact time when recording starts
          recordingStartTimeRef.current = performance.now();
          
          // Start playing the original track for sync
          if (!isPlaying) {
            // Reset playhead to beginning for better sync
            pausedAtRef.current = 0;
            setPlayheadPos(0);
            setIsPlaying(true);
          }
          
          // Define cleanup for this specific recording session
          cleanup = () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
            
            if (mediaStreamRef.current) {
              mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
          };
        } catch (error) {
          console.error('Error starting recording:', error);
        }
      };
      
      startRecording();
    } else {
      // Only stop recording when transitioning from recording to not recording
      const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }

        mediaRecorderRef.current = null;
        
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // Stop playback when recording stops
        if (isPlaying) {
          setIsPlaying(false);
        }
      };
      
      // Only call stopRecording if we were previously recording
      if (mediaRecorderRef.current) {
        stopRecording();
      }
    }
    
    // Return the cleanup function that will only be used for unmounting
    // or when isRecording changes
    return cleanup;
  }, [isRecording, selectedAudioInputDevice, isPlaying, setIsPlaying]);
  
  
  // Update recordingAudioChunks when selectedTake changes
  useEffect(() => {
    if (selectedTake) {
      // Process the selected take's audio chunks
      const processAudioChunks = async () => {
        try {
          // Create blob from chunks with the correct MIME type
          const blob = new Blob(selectedTake.chunks, { 
            type: selectedTake.mimeType || 'audio/webm' 
          });
          
          // Update recordingAudioChunks in parent component
          if (setRecordingAudioChunks) {
            setRecordingAudioChunks(selectedTake.chunks);
          }
          
        // Convert blob to array buffer
        const arrayBuffer = await blob.arrayBuffer();
        
        // Decode audio data
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // Store buffer
        recordingBufferRef.current = audioBuffer;
        
        // Render waveform if canvas is available
        if (recordingCanvasRef.current) {
            renderWaveform(audioBuffer, recordingCanvasRef);
        }
        } catch (error) {
          console.error('Error processing selected take audio chunks:', error);
        }
      };
      
      processAudioChunks();
    }
  }, [selectedTake, setRecordingAudioChunks]);
  
  // Determine if recording track has content
  const hasRecordingTrack = recordingBufferRef.current !== null || selectedTake !== null;
  
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
              onMouseDown={handlePlayheadMouseDown}
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
          <div className="waveform-container" onClick={handleWaveformClick}>
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