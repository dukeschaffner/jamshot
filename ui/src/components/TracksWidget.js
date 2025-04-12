'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDuration, renderWaveform } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faPlay, faPause, faStepBackward, faStepForward, faTrash, faUpload, faCloudUploadAlt, faHeadphones } from '@fortawesome/free-solid-svg-icons';
import './TracksWidget.css';
import { useAudio } from '../lib/AudioContext';
export default function TracksWidget({ 
  isPlaying,
  setIsPlaying,
  trackDuration,
  showCollabModal,
  isRecording,
  setIsRecording,
  originalAudioChunks = null,
  recordingPlaybackBuffer,
  setRecordingPlaybackBuffer,
  fileChunks,
  selectedAudioInputDevice = null,
  userLatencyCompensation = 0,
  isCollab = false
}) {
    //#region audio properties
    const [audioContext, setAudioContext] = useState(null);
    const [takes, setTakes] = useState([]);
    const [selectedTake, setSelectedTake] = useState(null);
    const [playheadTime, setPlayheadTime] = useState(0); //Used to scrub and to set playback start time
    const [isLooping, setIsLooping] = useState(true);
    const [looperLeftPos, setLooperLeftPos] = useState(0);
    const [looperRightPos, setLooperRightPos] = useState(100);
    const [effectiveDuration, setEffectiveDuration] = useState(10); // Default to 90 seconds (1:30)

    const originalBufferRef = useRef(null);
    const originalGainNodeRef = useRef(null);
    const originalTrackGainRef = useRef(.8);
    const originalAnalyzerRef = useRef(null);
    const [originalTrackSolo, setOriginalTrackSolo] = useState(false);
    const [originalTrackLevel, setOriginalTrackLevel] = useState(-60); // dB level for original track

    const recordedBufferRef = useRef(null);
    const recordingGainNodeRef = useRef(null);
    const recordingTrackGainRef = useRef(.8);
    const recordingAnalyzerRef = useRef(null);
    const [recordingTrackSolo, setRecordingTrackSolo] = useState(false);
    const [recordingTrackLevel, setRecordingTrackLevel] = useState(-60); // dB level for recording track

    
    const micStreamRef = useRef(null);
    const [inputLevel, setInputLevel] = useState(-60); // dB level for microphone input
    const inputAnalyzerRef = useRef(null);
    const recorderRef = useRef(null);

    
    const isRecordingRef = useRef(false);
    const isPlayingRef = useRef(false);
    const activeSourcesRef = useRef([]); // Track active audio sources for stopping playback
    const startingPlaybackRef = useRef(false);
    const startingRecordingRef = useRef(false);
    const meterAnimationFrameRef = useRef(null);
    const absoluteRecordingStartTimeRef = useRef(null); // For calculating the latency offset
    const relativeRecordingStartTimeRef = useRef(0); // Tracks when the recording starts relative to the original track
    const absolutePlaybackStartTimeRef = useRef(0);
    //const relativePlaybackStartTimeRef = useRef(0);
    const playheadInternalTimeRef = useRef(0);


    const tempRecordingStartTimeRef1 = useRef(0);
    const tempRecordingStartTimeRef2 = useRef(0);
    //#endregion

    //#region ui properties
    const [playheadPos, setPlayheadPos] = useState(0);
    const [recordingStartPos, setRecordingStartPos] = useState(0);
    const [recordingWidth, setRecordingWidth] = useState(0);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [isDraggingLooperLeft, setIsDraggingLooperLeft] = useState(false);
    const [isDraggingLooperRight, setIsDraggingLooperRight] = useState(false);
    const [isDraggingLooperRegion, setIsDraggingLooperRegion] = useState(false);
    const [isDraggingRecordingRegion, setIsDraggingRecordingRegion] = useState(false);
    const [isDraggingCropStart, setIsDraggingCropStart] = useState(false);
    const [isDraggingCropEnd, setIsDraggingCropEnd] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [recordingStartPosBeforeDrag, setRecordingStartPosBeforeDrag] = useState(0);
    const [looperStartWidth, setLooperStartWidth] = useState(0);
    const [looperStartLeft, setLooperStartLeft] = useState(0);
    const [selectedForDeletion, setSelectedForDeletion] = useState(false);
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [showContextMenu, setShowContextMenu] = useState(false);

    const dawHeaderRef = useRef(null);
    const waveformContainerRef = useRef(null);
    const originalCanvasRef = useRef(null);
    const recordingCanvasRef = useRef(null);
    const croppedRecordingCanvasRef = useRef(null);
    const recordingContainerRef = useRef(null);
    const recordingTrackContainerRef = useRef(null);
    const playheadRef = useRef(null);
    const playheadIntervalRef = useRef(null);
    const looperRef = useRef(null);
    const looperHandleLeftRef = useRef(null);
    const looperHandleRightRef = useRef(null);
    const looperRegionRef = useRef(null);
    const cropStartOverlayRef = useRef(null);
    const cropEndOverlayRef = useRef(null);
    const takesCountRef = useRef(0); // Ref to track the number of takes

    const recordingStartPosRef = useRef(0);
    
    const [cropStartPercentage, setCropStartPercentage] = useState(0);
    const cropStartTimeRef = useRef(0);
    const [cropEndPercentage, setCropEndPercentage] = useState(0);
    const cropEndTimeRef = useRef(0);
    const [showCropHandles, setShowCropHandles] = useState(false);
    //#endregion

    const {isPlaying: isPlayingGlobal, togglePlayPause: togglePlayPauseGlobal } = useAudio();

    // Helper functions
    const posToTime = (pos, duration) => {
        return (pos / 100) * duration;
    };
    
    const timeToPos = (time, duration) => {
        return (time / duration) * 100;
    };

    // Calculate the effective duration based on mode and available audio
    // Replace function with useEffect that updates state
    useEffect(() => {
      // In collab mode, use the provided trackDuration or original buffer duration
      if (isCollab && originalBufferRef.current) {
        setEffectiveDuration(originalBufferRef.current.duration);
      }
      // In non-collab mode, check for recorded/uploaded audio
      else if (recordingPlaybackBuffer) {
        setEffectiveDuration(recordingPlaybackBuffer.duration);
      }
      // Default value is already set in state initialization (90 seconds)
    }, [isCollab, originalBufferRef.current, recordingPlaybackBuffer]);

    // Handle extending duration when recording exceeds current duration
    useEffect(() => {
      if (!isCollab && isRecording && recordedBufferRef.current) {
        const currentPlaybackTime = playheadInternalTimeRef.current + (audioContext?.currentTime - absolutePlaybackStartTimeRef.current);
        // If we're approaching the end, extend the duration
        if (currentPlaybackTime + 5 > effectiveDuration) {  // Add 5 second buffer
          setEffectiveDuration(prev => prev + 30); // Extend by 30 seconds
        }
      }
    }, [isCollab, isRecording, playheadInternalTimeRef.current, absolutePlaybackStartTimeRef.current]);

    const processAudioChunks = async (chunks) => {
        if (!chunks || chunks.length === 0 || !audioContext) return;
        
        try {
          // Create blob from chunks
          const blob = new Blob(chunks, { type: 'audio/webm' });
          
          // Convert blob to array buffer
          const arrayBuffer = await blob.arrayBuffer();
          
          // Decode audio data
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Store buffer
          return audioBuffer;
        } catch (error) {
          console.error('Error processing audio chunks:', error);
        }
    };
    
    // Handle mouse down on crop start handle
    const handleCropStartMouseDown = (e) => {
      e.stopPropagation();
      if (isPlaying || isRecording) return;
      
      setIsDraggingCropStart(true);
      setDragStartX(e.clientX);
    };

    // Handle mouse down on crop end handle
    const handleCropEndMouseDown = (e) => {
      e.stopPropagation();
      if (isPlaying || isRecording) return;
      
      setIsDraggingCropEnd(true);
      setDragStartX(e.clientX);
    };

    //#region audio processing


    // Initialize the audio context
    useEffect(() => {
      if (typeof window !== 'undefined') {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const newAudioContext = new AudioContext();
          setAudioContext(newAudioContext);
          
          // Create analyzer nodes for meters
          const originalAnalyzer = newAudioContext.createAnalyser();
          originalAnalyzer.fftSize = 2048;
          originalAnalyzer.smoothingTimeConstant = 0.8;
          originalAnalyzerRef.current = originalAnalyzer;
          
          const recordingAnalyzer = newAudioContext.createAnalyser();
          recordingAnalyzer.fftSize = 2048;
          recordingAnalyzer.smoothingTimeConstant = 0.8;
          recordingAnalyzerRef.current = recordingAnalyzer;
          
          const inputAnalyzer = newAudioContext.createAnalyser();
          inputAnalyzer.fftSize = 2048;
          inputAnalyzer.smoothingTimeConstant = 0.8;
          inputAnalyzerRef.current = inputAnalyzer;

          // Start the meter animation loop
          startMeterAnimation();
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
        if (meterAnimationFrameRef.current) {
          cancelAnimationFrame(meterAnimationFrameRef.current);
        }
      };
    }, []);
  
    // Sync the isRecording ref with the state
    useEffect(() => {
        isPlayingRef.current = isPlaying;
      }, [isPlaying]);
    useEffect(() => {
      isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
      playheadInternalTimeRef.current = playheadTime;
    }, [playheadTime]);

    useEffect(() => {
      recordingStartPosRef.current = recordingStartPos;
    }, [recordingStartPos]);

  // Process audio chunks when they change
  useEffect(() => {
    const processOriginalAudioChunks = async () => {
      if (originalAudioChunks) {
        originalBufferRef.current = await processAudioChunks(originalAudioChunks);
      }
    };

    processOriginalAudioChunks();
  }, [originalAudioChunks]);

  // Play back the recorded audio synchronized with the original track (if in collab mode)
  const play = () => {
    if ((!originalBufferRef.current && isCollab) || !audioContext) {
      return;
    }

    if(isPlayingGlobal){
      togglePlayPauseGlobal();
    }
    
    // Resume context if needed
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    console.log('playing');
    
    let activeSources = [];

    // Only setup original track if in collab mode or if it's the selected take
    if (isCollab && originalBufferRef.current) {
      // Create source nodes for original track
      const trackSource = audioContext.createBufferSource();
      trackSource.buffer = originalBufferRef.current;
      const trackGain = audioContext.createGain();
      
      // Apply solo/mute logic for original track
      if (recordingTrackSolo && !originalTrackSolo) {
        trackGain.gain.value = 0; // Mute original track if only recording is solo'd
      } else {
        trackGain.gain.value = originalTrackGainRef.current; // Normal volume
      }
      
      // Connect to analyzer for meter
      trackSource.connect(trackGain);
      trackGain.connect(originalAnalyzerRef.current);
      originalAnalyzerRef.current.connect(audioContext.destination);
      
      // Store the gain node in the ref for real-time control
      originalGainNodeRef.current = trackGain;
      
      activeSources.push(trackSource);
    }

    // Play recording buffer if available and not recording
    if (!isRecording && recordingPlaybackBuffer) {
      const recordedGain = audioContext.createGain();
      
      // Apply solo/mute logic for recording track in collab mode
      if (isCollab) {
        if (originalTrackSolo && !recordingTrackSolo) {
          recordedGain.gain.value = 0; // Mute recording track if only original is solo'd
        } else {
          recordedGain.gain.value = recordingTrackGainRef.current; // Normal volume
        }
      } else {
        // In non-collab mode, always play at normal volume (no solo logic needed)
        recordedGain.gain.value = recordingTrackGainRef.current;
      }
      
      const recordedSource = audioContext.createBufferSource();
      recordedSource.buffer = recordingPlaybackBuffer;
      recordedSource.connect(recordedGain);
      
      // Connect to analyzer for meter
      recordedGain.connect(recordingAnalyzerRef.current);
      recordingAnalyzerRef.current.connect(audioContext.destination);
      
      activeSources.push(recordedSource);
      
      // Store the gain node in the ref for real-time control
      recordingGainNodeRef.current = recordedGain;
    }
    
    // Store active sources for stopping playback
    activeSourcesRef.current = activeSources;
    
    // Start playback with latency compensation
    let startTime;
    if(isLooping){
        startTime = posToTime(looperLeftPos, effectiveDuration);
        setPlayheadTime(startTime);
        setPlayheadPos(looperLeftPos);
        playheadInternalTimeRef.current = startTime;
    }
    else{
        startTime = playheadInternalTimeRef.current;
    }
    
    // Start playback for each source
    activeSources.forEach(source => {
      source.start(0, startTime);
    });
    
    if(isRecording){
      relativeRecordingStartTimeRef.current = startTime;
      setRecordingStartPos(timeToPos(startTime, effectiveDuration));
      setRecordingWidth(0);
    }

    absolutePlaybackStartTimeRef.current = audioContext.currentTime;
    console.log('Absolute playback start time set:', absolutePlaybackStartTimeRef.current);

    // Enable the play button when playback is complete
    if (activeSources.length > 0) {
      activeSources[0].onended = function() {
        if(playheadInternalTimeRef.current + (audioContext.currentTime - absolutePlaybackStartTimeRef.current) >= effectiveDuration){ //Ended naturally, no looping
          if(isLooping){ //Go to the start of the looper
            seekToTime(posToTime(looperLeftPos, effectiveDuration));
          }
          else{
            playheadInternalTimeRef.current = 0;
            setIsPlaying(false);
            activeSourcesRef.current = [];
            if(isRecording){
              stopRecording();
            }
          }
        }
      };
    }
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
      
      // Clear gain node references
      originalGainNodeRef.current = null;
      recordingGainNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const seekToTime = (time) => {
    // Update the playhead position and time
    setPlayheadTime(time);
    setPlayheadPos(timeToPos(time, effectiveDuration));
    
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
    if (!isRecording || !audioContext) return;
    
    try {
      // Resume the audio context if it's suspended (important for Chrome)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      console.log('Recording started - audioContext.currentTime:', audioContext.currentTime);
      tempRecordingStartTimeRef1.current = audioContext.currentTime;
      
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
      
      // Connect to input analyzer for meter
      micSource.connect(inputAnalyzerRef.current);
      
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
          
          //if recorded data length is 0, log the time that the first sample in the buffer would have been recorded
          if(recordedData.length === 0){
            tempRecordingStartTimeRef2.current = audioContext.currentTime - (bufferCopy.length / audioContext.sampleRate);
            console.log('Recording start based on buffer:', tempRecordingStartTimeRef2.current, 'seconds');
            
        }
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
      absoluteRecordingStartTimeRef.current = audioContext.currentTime;
      console.log('Absolute recording start time set:', absoluteRecordingStartTimeRef.current, 'Relative start time:', relativeRecordingStartTimeRef.current);
      
      isRecordingRef.current = true;
      
      console.log('Recording started with sample rate:', audioContext.sampleRate);
    } catch (e) {
      console.error('Recording error:', e);
    }
  };



  // Function to create a new take from the recorded buffer
  const createTakeFromRecordedBuffer = (buffer, isFile = false) => {
    if (!buffer) {
      console.error('No recorded buffer available');
      return;
    }
    
    try {
      // Convert to high-quality WAV format
    //   const wavArrayBuffer = audioBufferToWav(
    //     recordedBuffer, 
    //     recorderRef.current?.sampleRate || audioContext.sampleRate
    //   );

    //TODO: cleanup latency methods
    // const recordingLatency1 = absolutePlaybackStartTimeRef.current - tempRecordingStartTimeRef1.current;
    // const recordingLatency2 = absolutePlaybackStartTimeRef.current - absoluteRecordingStartTimeRef.current;

      const recordingLatency = !isFile ? audioContext.outputLatency + (absolutePlaybackStartTimeRef.current - tempRecordingStartTimeRef2.current) : 0;

      console.log('Input latency point 1:', absolutePlaybackStartTimeRef.current - tempRecordingStartTimeRef1.current, 'seconds');
      console.log('Input latency point 2:', absolutePlaybackStartTimeRef.current - absoluteRecordingStartTimeRef.current, 'seconds');
      console.log('Input latency based on buffer:', absolutePlaybackStartTimeRef.current - tempRecordingStartTimeRef2.current, 'seconds');
      console.log('output latency:', audioContext.outputLatency, 'seconds');
      
      const startTime = isFile ? 0 : relativeRecordingStartTimeRef.current;
      const endTime = isFile ? buffer.duration : startTime + buffer.duration;

      // In non-collab mode, if the recording exceeds current duration, extend it
      if (!isCollab && endTime > effectiveDuration) {
        // Round up to nearest 30 seconds for a cleaner UI
        const newDuration = Math.ceil(endTime / 30) * 30;
        setEffectiveDuration(newDuration);
      }

      // Create a take with the high-quality WAV data
      const takeNumber = takes.length + 1;
      const newTake = {
        id: Date.now().toString(),
        name: `Take ${takeNumber}`,
        buffer: buffer,
        recordedAt: Date.now(),
        startTime: startTime, //time relative to time=0 of DAW. IE the time in the DAW that the audio starts
        endTime: endTime, //time relative to time=0 of DAW
        timeOffset: 0, //time offset of the recording audio relative to the startTime
        recordingLatency: recordingLatency,
        mimeType: 'audio/wav',
        sampleRate: recorderRef.current?.sampleRate || audioContext.sampleRate,
        bitDepth: 24
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

  useEffect(() => {
    if(fileChunks){
      let fileBuffer = processAudioChunks(fileChunks);
      createTakeFromRecordedBuffer(fileBuffer);
    }
  }, [fileChunks]);

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
      
      // Create a take from the recorded buffer
      createTakeFromRecordedBuffer(recordedBuffer);
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

  // Add keyboard shortcut handler for space key
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle space key and prevent default behavior (page scrolling)
      if (e.code === 'Space' || e.key === ' ') {
        // Ignore if user is typing in an input field, textarea, or contentEditable element
        if (
          e.target.tagName === 'INPUT' || 
          e.target.tagName === 'TEXTAREA' || 
          e.target.isContentEditable
        ) {
          return;
        }
        
        e.preventDefault();
        
        // If recording, stop recording
        if (isRecordingRef.current) {
          setIsRecording(false);
        } 
        // Otherwise toggle playback
        else {
          setIsPlaying(prevState => !prevState);
        }
      }
      else if (e.code === 'Enter' || e.key === 'Enter') {
        // Ignore if user is typing in an input field, textarea, or contentEditable element
        if (
          e.target.tagName === 'INPUT' || 
          e.target.tagName === 'TEXTAREA' || 
          e.target.isContentEditable
        ) {
          return;
        }
        
        e.preventDefault();
        
        seekToTime(0);
      }
    };

    // Add event listener to the window
    window.addEventListener('keydown', handleKeyDown);

    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [stopRecording, setIsPlaying]); // Include dependencies

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

  //Generate recording playback buffer
  useEffect(() => {
    const createRecordingPlaybackBuffer = (selectedTake) => {
      if(!selectedTake) return;
      let recordedBuffer = selectedTake.buffer;
      let resultBuffer;
      
      const adjustedAbsoluteStartTime = selectedTake.startTime - userLatencyCompensation / 1000 - selectedTake.recordingLatency;
      const adjustedRelativeStartTime = selectedTake.timeOffset;
      const adjustedRelativeEndTime = (selectedTake.endTime - selectedTake.startTime) + selectedTake.timeOffset;

      // Check if we need to pad the buffer (if it's shorter than the original track)
      if (originalBufferRef.current && recordedBuffer.duration < originalBufferRef.current.duration) {
        console.log('Padding recorded buffer to match original track duration');

        // Create a new buffer with the same duration as the original track
        const paddedBuffer = audioContext.createBuffer(
          recordedBuffer.numberOfChannels,
          originalBufferRef.current.length,
          recordedBuffer.sampleRate
        );
        
        
        const startSample = Math.floor(adjustedAbsoluteStartTime * recordedBuffer.sampleRate); //sample in the resulting buffer that audio begins
        const recordingStartSample = Math.floor(adjustedRelativeStartTime * recordedBuffer.sampleRate); //sample in the recorded buffer to begin copying to resulting buffer
        const recordingEndSample = Math.floor(adjustedRelativeEndTime * recordedBuffer.sampleRate); //sample in the recorded buffer to end copying to resulting buffer
        
        // Copy the recorded data into the padded buffer at the correct position
        for (let channel = 0; channel < recordedBuffer.numberOfChannels; channel++) {
          const paddedData = paddedBuffer.getChannelData(channel);
          const recordedData = recordedBuffer.getChannelData(channel);
          
          // Fill with zeros before the recording (if needed)
          for (let i = 0; i < startSample; i++) {
            paddedData[i] = 0;
          }
          
          // Copy the recorded data
          for (let i = 0; i < recordingEndSample - recordingStartSample; i++) {
            if (startSample + i < paddedBuffer.length) {
              paddedData[startSample + i] = recordedData[recordingStartSample + i];
            }
          }
          
          // Fill with zeros after the recording (if needed)
          for (let i = startSample + (recordingEndSample - recordingStartSample); i < paddedBuffer.length; i++) {
            paddedData[i] = 0;
          }
        }
        
        resultBuffer = paddedBuffer;
      }
      // This should be prevented by recording rules
      else if(originalBufferRef.current && recordedBuffer.duration > originalBufferRef.current.duration) {
        console.log('Trimming recorded buffer to match original track duration');
        
        // Create a new buffer with the same duration as the original track
        const trimmedBuffer = audioContext.createBuffer(
          recordedBuffer.numberOfChannels,
          originalBufferRef.current.length,
          recordedBuffer.sampleRate
        );
        
        const startSample = Math.floor(adjustedAbsoluteStartTime * recordedBuffer.sampleRate);
        
        // Copy only the portion of the recorded data that fits within the original duration
        for (let channel = 0; channel < recordedBuffer.numberOfChannels; channel++) {
          const trimmedData = trimmedBuffer.getChannelData(channel);
          const recordedData = recordedBuffer.getChannelData(channel);
          
          // Fill with zeros before the recording (if needed)
          for (let i = 0; i < startSample && i < trimmedBuffer.length; i++) {
            trimmedData[i] = 0;
          }
          
          // Copy the recorded data, but only up to the original buffer length
          for (let i = 0; i < trimmedBuffer.length - startSample; i++) {
            if (i < recordedBuffer.length) {
              trimmedData[startSample + i] = recordedData[i];
            } else {
              trimmedData[startSample + i] = 0;
            }
          }
        }
        
        resultBuffer = trimmedBuffer;
      } else {
        // If no original buffer or durations match, just use the recorded buffer as is
        resultBuffer = recordedBuffer;
      }
      
      return resultBuffer;
    };
    
    // Check if we have a selected take
    if(selectedTake) {
      let recordedBuffer = createRecordingPlaybackBuffer(selectedTake);
      setRecordingPlaybackBuffer(recordedBuffer);
      renderWaveform(recordedBuffer, croppedRecordingCanvasRef, selectedTake.startTime, selectedTake.endTime);
    }
  }, [selectedTake, userLatencyCompensation]);

  //#endregion
  

  //#region ui rendering
  // Render waveforms when buffers change
  useEffect(() => {
    if (originalBufferRef.current) {
      renderWaveform(originalBufferRef.current, originalCanvasRef);
    }
    
    // if (recordedBufferRef.current && selectedTake) {
    //   renderWaveform(recordedBufferRef.current, croppedRecordingCanvasRef, selectedTake.startTime, selectedTake.endTime);
    // }
  }, [originalBufferRef.current, recordedBufferRef.current]);

  // Update playhead position when playback starts
  useEffect(() => {
    if (isPlaying) {
      const updatePlayhead = () => {
        const currentTime = playheadInternalTimeRef.current + (audioContext.currentTime - absolutePlaybackStartTimeRef.current);
        const playheadPos = timeToPos(currentTime, effectiveDuration);
        if(isLooping && playheadPos >= looperRightPos){ //Go to the start of the looper
          if(isRecording){ //if recording, then stop recording
            setIsRecording(false);
          }
          else{
            seekToTime(posToTime(looperLeftPos, effectiveDuration));
          }
        }
        else{
          setPlayheadPos(playheadPos);
          
          // Update recording indicator width when recording
          if (isRecording) {
            const indicatorWidth = playheadPos - recordingStartPos;
            setRecordingWidth(indicatorWidth > 0 ? indicatorWidth : 0);
          }
        }
      };
      
      updatePlayhead();
      
      playheadIntervalRef.current = setInterval(updatePlayhead, 20);
      
      return () => {
        clearInterval(playheadIntervalRef.current);
      };
    }
  }, [isPlaying, effectiveDuration]);


    // Handle waveform click
    const handleWaveformClick = (e) => {
        if (!waveformContainerRef.current || isRecording) return; //
        
        const rect = waveformContainerRef.current.getBoundingClientRect();
        const clickPos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        seekToTime(posToTime(clickPos, effectiveDuration));
    };

      // Mouse down handlers for dragging
  const handlePlayheadMouseDown = (e) => {
    e.stopPropagation();
    if(isPlaying || isRecording) {return;}
    setIsDraggingPlayhead(true);
  };
  
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

  const handleRecordingRegionMouseDown = (e) => {
    e.stopPropagation();
    // Only allow dragging if not playing or recording
    if (isPlaying || isRecording) return;
    
    setIsDraggingRecordingRegion(true);
    setDragStartX(e.clientX);
    setRecordingStartPosBeforeDrag(recordingStartPos);
  };

  useEffect(() => {
    if(selectedTake){
      recordedBufferRef.current = selectedTake.buffer;
      
      if(isCollab){
        const startPos = timeToPos(selectedTake.startTime, effectiveDuration);
        setRecordingStartPos(startPos);

        const width = timeToPos(selectedTake.endTime - selectedTake.startTime, effectiveDuration);
        setRecordingWidth(width);
      }
      else{
        setRecordingStartPos(0);
        setRecordingWidth(100);
      }

      
    }
  }, [selectedTake, effectiveDuration]);

    // Mouse event handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
          if (!isDraggingLooperLeft && !isDraggingLooperRight && !isDraggingPlayhead && !isDraggingLooperRegion && !isDraggingRecordingRegion && !isDraggingCropStart && !isDraggingCropEnd) return;
          
        const rect = dawHeaderRef.current.getBoundingClientRect();
        const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        // Dragging playhead
        if (isDraggingPlayhead) {
          setPlayheadPos(mousePos);
          playheadInternalTimeRef.current = posToTime(mousePos, effectiveDuration);
          
        //   // Update audio position if playing
        //   if (isPlaying && audioContextRef.current) {
        //     pausedAtRef.current = posToTime(mousePos, trackDuration);
        //   }
            
        //   // Show time tooltip
        //   const time = posToTime(mousePos, trackDuration);
        //   showTimeTooltip(playheadRef.current, mousePos, formatDuration(time));
        }
        
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
        
        // Dragging recording region
        if (isDraggingRecordingRegion && selectedTake) {
          const deltaX = e.clientX - dragStartX;
          const deltaPercent = (deltaX / rect.width) * 100;
          
          // Calculate new position
          let newStartPos = recordingStartPosBeforeDrag + deltaPercent;
          
          // Ensure the recording stays within bounds
          if (newStartPos < 0) {
            newStartPos = 0;
          }
          
          if (newStartPos + recordingWidth > 100) {
            newStartPos = 100 - recordingWidth;
          }
          
          // Update recording position
          setRecordingStartPos(newStartPos);
          recordingStartPosRef.current = newStartPos;
        }
        
        // Handle crop start dragging
        if (isDraggingCropStart && selectedTake) {
          // Calculate crop position within the recording region
          const recordingRect = recordingContainerRef.current.getBoundingClientRect();
          const recordingStartX = recordingRect.left;
          const recordingWidth = recordingRect.width;
          const cropEndX = cropEndOverlayRef.current.getBoundingClientRect().left;
          const trackStartX = rect.left;
          const buffer = 5 * (rect.width / 100);
          var newCropX = 0;
          if(e.clientX < trackStartX) { //Do not allow user to crop beyond track start
            newCropX = trackStartX;
          }
          else if(e.clientX > cropEndX - buffer){ //Do not allow user to crop beyond track end
            newCropX = cropEndX - buffer;
          }
          else{
            newCropX = e.clientX;
          }

          if(newCropX < recordingStartX){
            newCropX = recordingStartX;
          }

          const relativePos = (newCropX - recordingStartX) / recordingWidth * 100;
          setCropStartPercentage(relativePos);

          cropStartTimeRef.current = posToTime((newCropX - trackStartX) / rect.width * 100, effectiveDuration);
        }
        
        // Handle crop end dragging
        if (isDraggingCropEnd && selectedTake) {
          // Calculate crop position within the recording region
          const recordingRect = recordingContainerRef.current.getBoundingClientRect();
          const recordingStartX = recordingRect.left;
          const recordingEndX = recordingRect.right;
          const recordingWidth = recordingRect.width;
          const cropStartX = cropStartOverlayRef.current.getBoundingClientRect().right;
          const trackStartX = rect.left;
          const trackEndX = rect.right;
          const buffer = 5 * (rect.width / 100);
          var newCropX = 0;
          if(e.clientX > trackEndX) { //Do not allow user to crop beyond track end
            newCropX = trackEndX;
          }
          else if(e.clientX < cropStartX + buffer){ //Do not allow user to crop beyond track start
            newCropX = cropStartX + buffer;
          }
          else{
            newCropX = e.clientX;
          }

          if(newCropX > recordingEndX){
            newCropX = recordingEndX;
          }

          const relativePos = (recordingEndX - newCropX) / recordingWidth * 100;
          setCropEndPercentage(relativePos);

          cropEndTimeRef.current = posToTime((newCropX - trackStartX) / rect.width * 100, effectiveDuration);
        }
      };
        
        const handleMouseUp = (e) => {
            //stop propagation
            e.stopPropagation();
          setIsDraggingLooperLeft(false);
          setIsDraggingLooperRight(false);
          setIsDraggingLooperRegion(false);

          if(isDraggingPlayhead){
            seekToTime(playheadInternalTimeRef.current);
            setIsDraggingPlayhead(false);
          }
          
          // If we were dragging the recording region, update the selected take's startTime and endTime
          if (isDraggingRecordingRegion && selectedTake) {
            const newStartTime = posToTime(recordingStartPosRef.current, effectiveDuration);
            const recordingDuration = selectedTake.endTime - selectedTake.startTime;
            const newEndTime = newStartTime + recordingDuration;

            // Update the selected take with new start and end times
            setSelectedTake(prevTake => ({
                ...prevTake,
                startTime: newStartTime,
                endTime: newEndTime
            }));
            setTakes(prevTakes => prevTakes.map(take => take.id === selectedTake.id ? {...take, startTime: newStartTime, endTime: newEndTime} : take));
          }
          
          setIsDraggingRecordingRegion(false);
          //hideTimeTooltip();
          
          // If we were dragging crop handles, update the recording
          if (isDraggingCropStart && selectedTake) 
          {
            const prevOffset = selectedTake.timeOffset;
            const newOffset = cropStartTimeRef.current - (selectedTake.startTime - prevOffset);

            setSelectedTake(prevTake => ({
                ...prevTake,
                startTime: cropStartTimeRef.current,
                timeOffset: newOffset
            }));
            setTakes(prevTakes => prevTakes.map(take => take.id === selectedTake.id ? {...take, startTime: cropStartTimeRef.current, timeOffset: newOffset} : take));
          }
          else if (isDraggingCropEnd && selectedTake) {

            setSelectedTake(prevTake => ({
                ...prevTake,
                endTime: cropEndTimeRef.current
            }));
            setTakes(prevTakes => prevTakes.map(take => take.id === selectedTake.id ? {...take, endTime: cropEndTimeRef.current} : take));
          }
          setIsDraggingCropEnd(false);
          setIsDraggingCropStart(false);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }, [
        isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion, isDraggingRecordingRegion,
        isDraggingCropStart, isDraggingCropEnd,
        looperLeftPos, looperRightPos, dragStartX, looperStartLeft, looperStartWidth,
        isPlaying, playheadPos, isLooping, trackDuration, recordingStartPosBeforeDrag, recordingWidth, selectedTake,
        isCollab, recordingPlaybackBuffer, cropStartPercentage, cropEndPercentage
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
  
  // Generate dynamic time markers based on track duration
  const generateTimeMarkers = () => {
    const markers = [];
    
    // Determine appropriate interval based on track duration
    let interval; // in seconds
    let numMarkers;
    
    if (effectiveDuration <= 30) {
      // For short tracks (≤30s), show markers every 5 seconds
      interval = 5;
      numMarkers = Math.ceil(effectiveDuration / interval) + 1;
    } else if (effectiveDuration <= 60) {
      // For medium tracks (≤60s), show markers every 10 seconds
      interval = 10;
      numMarkers = Math.ceil(effectiveDuration / interval) + 1;
    } else if (effectiveDuration <= 180) {
      // For longer tracks (≤3min), show markers every 30 seconds
      interval = 30;
      numMarkers = Math.ceil(effectiveDuration / interval) + 1;
    } else if (effectiveDuration <= 600) {
      // For very long tracks (≤10min), show markers every minute
      interval = 60;
      numMarkers = Math.ceil(effectiveDuration / interval) + 1;
    } else {
      // For extremely long tracks (>10min), show markers every 2 minutes
      interval = 120;
      numMarkers = Math.ceil(effectiveDuration / interval) + 1;
    }
    
    // Limit the number of markers to prevent overcrowding
    const maxMarkers = 15;
    if (numMarkers > maxMarkers) {
      interval = Math.ceil(effectiveDuration / (maxMarkers - 1));
      numMarkers = Math.ceil(effectiveDuration / interval) + 1;
    }
    
    // Always include start marker
    markers.push(
      <div 
        key="marker-start" 
        className="time-marker time-marker-start" 
        style={{ left: '0%' }}
      >
        {formatDuration(0)}
      </div>
    );
    
    // Add intermediate markers
    for (let i = 1; i < numMarkers - 1; i++) {
      const time = i * interval;
      if (time < effectiveDuration) { // Only add if within track duration
        const percentage = timeToPos(time, effectiveDuration);
        markers.push(
          <div 
            key={`marker-${i}`} 
            className="time-marker time-marker-mid" 
            style={{ left: `${percentage}%` }}
          >
            {formatDuration(time)}
          </div>
        );
      }
    }
    
    // Always include end marker (unless it's very close to the last interval marker)
    const lastIntervalTime = (numMarkers - 1) * interval;
    if (Math.abs(effectiveDuration - lastIntervalTime) > interval / 5) {
      markers.push(
        <div 
          key="marker-end" 
          className="time-marker time-marker-end" 
          style={{ left: '100%' }}
        >
          {formatDuration(effectiveDuration)}
        </div>
      );
    }
    
    return markers;
  };
  
  // Generate musical grid lines based on BPM and time signature
  const generateMusicalGrid = () => {
    const bpm = 115; // Beats per minute
    const beatsPerMeasure = 4; // 4/4 time signature
    
    // Calculate seconds per beat and seconds per measure
    const secondsPerBeat = 60 / bpm;
    const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
    
    const gridLines = [];
    
    // Calculate how many measures fit in the track
    const totalMeasures = Math.ceil(effectiveDuration / secondsPerMeasure);
    
    // Generate measure lines (strong grid lines)
    for (let measure = 0; measure <= totalMeasures; measure++) {
      const measureTime = measure * secondsPerMeasure;
      if (measureTime <= effectiveDuration) {
        const position = timeToPos(measureTime, effectiveDuration);
        gridLines.push(
          <div 
            key={`measure-${measure}`} 
            className="grid-line measure-line" 
            style={{ left: `${position}%` }}
            title={`Measure ${measure + 1}`}
          />
        );
      }
    }
    
    // Generate beat lines (weaker grid lines)
    for (let beat = 0; beat <= totalMeasures * beatsPerMeasure; beat++) {
      // Skip beats that fall on measure boundaries (already covered by measure lines)
      if (beat % beatsPerMeasure !== 0) {
        const beatTime = beat * secondsPerBeat;
        if (beatTime <= effectiveDuration) {
          const position = timeToPos(beatTime, effectiveDuration);
          gridLines.push(
            <div 
              key={`beat-${beat}`} 
              className="grid-line beat-line" 
              style={{ left: `${position}%` }}
              title={`Beat ${(beat % beatsPerMeasure) + 1}`}
            />
          );
        }
      }
    }
    
    return gridLines;
  };
  
  // File handling functions
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
      
      // Check if the file duration exceeds the original buffer duration
      if (originalBufferRef.current && fileBuffer.duration > originalBufferRef.current.duration) {
        alert('The uploaded file is too long. Please select a file that is shorter than or the same length as the original track.');
        return;
      }
      
      // Create a take from the file
      createTakeFromRecordedBuffer(fileBuffer, true);
    } catch (error) {
      console.error('Error processing uploaded file:', error);
    }
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
  };
  
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
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
      
      // Create a take from the file
      createTakeFromRecordedBuffer(fileBuffer, true);
    } catch (error) {
      console.error('Error processing dropped file:', error);
    }
  };
  
  // Function to update gain values based on solo states without restarting playback
  const updateGainValues = (updates) => {
    //updates has form [{node: originalGainNodeRef, gain: 0.7}, {node: recordingGainNodeRef, gain: 1}]
    updates.forEach((update) => {
        update.node.gain.setValueAtTime(update.gain, audioContext.currentTime);
        update.node.gain.linearRampToValueAtTime(update.gain, audioContext.currentTime + 0.05);
    });
  };

  // Toggle solo for original track
  const toggleOriginalSolo = (e) => {
    e.stopPropagation();
    
    let updates = [];

    // If recording track is solo'd, unsolo it
    if (recordingTrackSolo) {
        updates.push({node: recordingGainNodeRef.current, gain: 0});
        updates.push({node: originalGainNodeRef.current, gain: originalTrackGainRef.current});
        setRecordingTrackSolo(false);
    }
    else if (originalTrackSolo) {
        updates.push({node: recordingGainNodeRef.current, gain: recordingTrackGainRef.current});
    }
    else if (!originalTrackSolo && !recordingTrackSolo) {
        updates.push({node: originalGainNodeRef.current, gain: originalTrackGainRef.current});
        updates.push({node: recordingGainNodeRef.current, gain: 0});
    }

    // Toggle original track solo
    setOriginalTrackSolo(prev => !prev);

    // If currently playing, update gain values in real-time
    if (isPlaying && audioContext) {
      // Use setTimeout to ensure state has updated before updating gain values
      setTimeout(() => {
        updateGainValues(updates);
      }, 10);
    }
  };
  
  // Toggle solo for recording track
  const toggleRecordingSolo = (e) => {
    e.stopPropagation();
    
    let updates = [];

    // If original track is solo'd, unsolo it
    if (originalTrackSolo) {
        updates.push({node: originalGainNodeRef.current, gain: 0});
        updates.push({node: recordingGainNodeRef.current, gain: recordingTrackGainRef.current});
        setOriginalTrackSolo(false);
    }
    else if (recordingTrackSolo) {
        updates.push({node: originalGainNodeRef.current, gain: originalTrackGainRef.current});
    }
    else if (!originalTrackSolo && !recordingTrackSolo) {
        updates.push({node: originalGainNodeRef.current, gain: 0});
        updates.push({node: recordingGainNodeRef.current, gain: recordingTrackGainRef.current});
    }
    
    // Toggle recording track solo
    setRecordingTrackSolo(prev => !prev);

    // If currently playing, update gain values in real-time
    if (isPlaying && audioContext) {
      // Use setTimeout to ensure state has updated before updating gain values
      setTimeout(() => {
        updateGainValues(updates);
      }, 10);
    }
  };

  // Function to start the meter animation loop
  const startMeterAnimation = () => {
    // Use time-based throttling instead of frame counting
    let lastUpdateTime = 0;
    // Update interval in milliseconds (higher = less frequent updates)
    const updateInterval = 60; // Update every 100ms (adjust as needed)
    
    const updateMeters = () => {
      const currentTime = performance.now();
      const timeSinceLastUpdate = currentTime - lastUpdateTime;
      
      // Only process meter updates if enough time has passed
      if (timeSinceLastUpdate >= updateInterval) {
        lastUpdateTime = currentTime;
        
        // Update original track meter
        if (originalAnalyzerRef.current && isPlayingRef.current && !originalTrackSolo) {
          const dataArray = new Uint8Array(originalAnalyzerRef.current.frequencyBinCount);
          originalAnalyzerRef.current.getByteFrequencyData(dataArray);
          
          // Calculate RMS value
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += (dataArray[i] / 255.0) ** 2;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          
          // Convert to dB (with a floor of -60dB)
          const db = rms > 0 ? 20 * Math.log10(rms) : -60;
          setOriginalTrackLevel(Math.max(-60, db));
        } else if (!isPlayingRef.current) {
          // Gradually decrease level when not playing
          setOriginalTrackLevel(prevLevel => Math.max(-60, prevLevel - 3));
        }
        
        // Update recording track meter during playback
        if (recordingAnalyzerRef.current && isPlayingRef.current && !isRecordingRef.current && !recordingTrackSolo) {
          const dataArray = new Uint8Array(recordingAnalyzerRef.current.frequencyBinCount);
          recordingAnalyzerRef.current.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += (dataArray[i] / 255.0) ** 2;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -60;
          setRecordingTrackLevel(Math.max(-60, db));
        } else if (isRecordingRef.current && inputAnalyzerRef.current) {
          // Update input level meter during recording
          const dataArray = new Uint8Array(inputAnalyzerRef.current.frequencyBinCount);
          inputAnalyzerRef.current.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += (dataArray[i] / 255.0) ** 2;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -60;
          
          // Update both input and recording level during recording
          setInputLevel(Math.max(-60, db));
          setRecordingTrackLevel(Math.max(-60, db));
        } else if (!isPlayingRef.current && !isRecording) {
          // Gradually decrease level when not playing or recording
          setRecordingTrackLevel(prevLevel => Math.max(-60, prevLevel - 3));
          setInputLevel(prevLevel => Math.max(-60, prevLevel - 3));
        }
      }
      
      meterAnimationFrameRef.current = requestAnimationFrame(updateMeters);
    };
    
    meterAnimationFrameRef.current = requestAnimationFrame(updateMeters);
  };

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

  // Determine if we have any audio content
  const hasAudioContent = isCollab ? 
    (originalBufferRef.current !== null || hasRecordingTrack) : 
    hasRecordingTrack;

  // Handle recording click (to select it)
  const handleRecordingClick = (e) => {
    // If we're dragging, don't select
    if (isDraggingRecordingRegion) return;
    if (isRecording) return;
    
    // If recording is already selected, clicking again deselects it
    setSelectedForDeletion(prev => !prev);
    
    // Hide context menu if open
    setShowContextMenu(false);
    
    // Stop propagation to prevent waveform click handler
    e.stopPropagation();
  };

  // Handle right-click on recording for context menu
  const handleRecordingContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isRecording) return;
    
    // Position context menu at mouse position
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    
    // Select the recording automatically when right-clicking
    setSelectedForDeletion(true);
  };

  // Handle deletion of recording
  const handleDeleteRecording = () => {
    // If there are multiple takes, show confirmation dialog
    if (takes.length > 1) {
      setShowDeleteConfirmation(true);
    } else {
      // Just delete the single recording
      deleteRecording();
    }
    
    // Hide context menu
    setShowContextMenu(false);
  };

  // Delete recording
  const deleteRecording = () => {
    // Reset states
    recordedBufferRef.current = null;
    setRecordingPlaybackBuffer(null);
    setSelectedTake(null);
    setTakes([]);
    setSelectedForDeletion(false);
    setShowDeleteConfirmation(false);
  };

  // Handle click outside context menu to close it
  useEffect(() => {
    const handleClickOutside = () => {
      setShowContextMenu(false);
    };
    
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showContextMenu]);

  // Add keyboard event listener for delete/backspace
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle if recording is selected for deletion
      if (!selectedForDeletion) return;
      
      // Check for Delete or Backspace key
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        
        // If there are multiple takes, show confirmation dialog
        if (takes.length > 1) {
          setShowDeleteConfirmation(true);
        } else {
          // Just delete the single recording
          deleteRecording();
        }
      }
      
      // Escape key deselects
      if (e.key === 'Escape') {
        setSelectedForDeletion(false);
        setShowContextMenu(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedForDeletion, takes.length]);

  // Check if mouse is hovering near edges to show crop handles
  const handleRecordingMouseMove = (e) => {
    if (isPlaying || isRecording || !selectedTake || isDraggingRecordingRegion) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const leftEdgeZone = rect.left + 15; // 15px from left edge
    const rightEdgeZone = rect.right - 15; // 15px from right edge
    
    // If mouse is close to either edge, show the crop handles
    const isNearEdge = e.clientX < leftEdgeZone || e.clientX > rightEdgeZone;
    setShowCropHandles(isNearEdge);
    
    // Update cursor based on position
    if (e.clientX < leftEdgeZone) {
      e.currentTarget.style.cursor = 'col-resize';
    } else if (e.clientX > rightEdgeZone) {
      e.currentTarget.style.cursor = 'col-resize';
    } else {
      e.currentTarget.style.cursor = isCollab ? 'grab' : 'default';
    }
  };

  const handleRecordingMouseLeave = () => {
    setShowCropHandles(false);
  };

  // Initialize crop state when a take is selected
  useEffect(() => {
    if (selectedTake) {
      // Reset crop percentages whenever a new take is selected
      //ex
      // start time = 3
      //time offset = 1
      //crop start should be 1

      const cropStartTime = selectedTake.timeOffset;
      const cropEndTime = cropStartTime + selectedTake.endTime - selectedTake.startTime;
      setCropStartPercentage(cropStartTime / selectedTake.buffer.duration * 100);
      setCropEndPercentage((selectedTake.buffer.duration - cropEndTime) / selectedTake.buffer.duration * 100);
      
      // Render the full recording to the recordingCanvasRef for cropping view
      if (recordingCanvasRef.current) {
        renderWaveform(selectedTake.buffer, recordingCanvasRef);
      }
    }
  }, [selectedTake]);

  return (
    <div className="daw-container">
        <div className="daw-header">
            <div className="daw-header-left">

            </div>
            
            <div className="timeline" ref={dawHeaderRef}>
                
                {/* Playhead */}
                {hasAudioContent && (
                    <div 
                        className="playhead" 
                        ref={playheadRef}
                        onMouseDown={handlePlayheadMouseDown}
                        style={{ left: `${playheadPos}%`, height: `${24 + 116 + (isCollab ? 116 : 0)}px` }}
                    ></div>
                )}
                {/* Timeline */}
                <div className="track-label"></div>
                <div className="time-markers">
                    {generateTimeMarkers()}
                </div>

                {/* Musical Grid */}
                {/* <div className="musical-grid">
                    {generateMusicalGrid()}
                </div> */}

                {/* Looper - Only show if there's audio content */}
                {hasAudioContent && (
                  <div 
                    className="looper" 
                    ref={looperRef}
                    style={{ left: `${looperLeftPos}%`, width: `${looperRightPos - looperLeftPos}%`, cursor: isPlaying || isRecording ? 'not-allowed' : 'grab' }}
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
                )}
            </div>

                
            
        </div>
        <div className="daw-body">
        <div className="daw-tracks-headers">
            {isCollab && (
              <div className="track-label">
                  <span>Original</span>
                  <button 
                      className={`solo-button ${originalTrackSolo ? 'active' : ''}`}
                      onClick={toggleOriginalSolo}
                      disabled={isRecording}
                      title="Solo original track"
                  >
                      <FontAwesomeIcon icon={faHeadphones} />
                      <span>Solo</span>
                  </button>
              
                  {/* Original Track Meter */}
                  <div className="audio-meter-container">
                      <div 
                      className="audio-meter-bar" 
                      style={{ 
                          width: `${dbToPercent(originalTrackLevel)}%`,
                          backgroundColor: getMeterColor(originalTrackLevel)
                      }}
                      ></div>
                  </div>
              </div>
            )}
            <div className="track-label">
              <span>{isCollab ? 'Your Recording' : 'Your Track'}</span>
              {isCollab && (
                <button 
                  className={`solo-button ${recordingTrackSolo ? 'active' : ''}`}
                  onClick={toggleRecordingSolo}
                  disabled={isRecording || !hasRecordingTrack}
                  title="Solo your recording"
                >
                  <FontAwesomeIcon icon={faHeadphones} />
                  <span>Solo</span>
                </button>
              )}
              {isRecording && (
                <div className="recording-indicator">
                  <FontAwesomeIcon icon={faMicrophone} />
                  <span>Recording</span>
                </div>
              )}
              
              {/* Recording Track Meter */}
              <div className="audio-meter-container">
                <div 
                  className="audio-meter-bar" 
                  style={{ 
                    width: `${dbToPercent(isRecording ? inputLevel : recordingTrackLevel)}%`,
                    backgroundColor: getMeterColor(isRecording ? inputLevel : recordingTrackLevel)
                  }}
                ></div>
              </div>
            </div>
        </div>



        <div className="daw-tracks-container">
            {/* Original Track - only shown in collab mode */}
            {isCollab && (
              <div className="track-container parent-track">
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
                  </div>
                  
                </div>
              </div>
            )}

            {/* Recording Track - shown in both modes */}
            <div className={`track-container ${isCollab ? 'your-track' : 'parent-track'}`} ref={recordingTrackContainerRef}>
              {hasRecordingTrack || isRecording ? (
                <div 
                  className={`waveform-container 
                    ${isDraggingRecordingRegion ? 'dragging' : ''} 
                    ${selectedForDeletion ? 'selected' : ''}
                    ${isPlaying ? 'playing' : ''}
                    ${isRecording ? 'recording' : ''}
                    ${isDraggingCropStart || isDraggingCropEnd ? 'cropping' : ''}
                  `}
                  style={{
                    left: `${isDraggingCropStart || isDraggingCropEnd ? timeToPos(selectedTake.startTime - selectedTake.timeOffset, effectiveDuration) : recordingStartPos}%`,
                    width: `${isDraggingCropStart || isDraggingCropEnd ? timeToPos(selectedTake.buffer.duration, effectiveDuration) : recordingWidth}%`,
                    cursor: isPlaying || isRecording ? 'default' : (
                      showCropHandles ? 'col-resize' : (isCollab ? 'grab' : 'default')
                    )
                  }}
                  onClick={hasRecordingTrack && !isRecording ? handleRecordingClick : handleWaveformClick}
                  onMouseDown={isPlaying || isRecording ? null : (isCollab ? handleRecordingRegionMouseDown : null)}
                  onMouseMove={handleRecordingMouseMove}
                  onMouseLeave={handleRecordingMouseLeave}
                  onContextMenu={hasRecordingTrack && !isRecording ? handleRecordingContextMenu : null}
                  ref={recordingContainerRef}
                >
                  <div className="waveform">
                    {/* Recording Indicator */}
                    {isRecording ? (
                      <div className="recording-indicator-visual"/>
                    ) : (
                    <>
                        <canvas 
                            ref={recordingCanvasRef} 
                            width="1000" 
                            height="100" 
                            style={{ width: '100%', height: '100%', display: isDraggingCropStart || isDraggingCropEnd ? 'block' : 'none' }}
                        />
                        <canvas 
                            ref={croppedRecordingCanvasRef} 
                            width="1000" 
                            height="100" 
                            style={{ width: '100%', height: '100%', display: isDraggingCropStart || isDraggingCropEnd ? 'none' : 'block' }}
                        />
                        {isDraggingCropStart || isDraggingCropEnd ? (
                        <>
                            
                            {/* Show crop status indicator when cropping */}
                            {(isDraggingCropStart || isDraggingCropEnd) && (
                              <div className="crop-status">
                                Cropping: {isDraggingCropStart ? "Start" : "End"}
                              </div>
                            )}
                            <div 
                              className="crop-left-overlay"
                              ref={cropStartOverlayRef}
                              style={{ width: `${cropStartPercentage}%` }}
                            />
                            <div 
                              className="crop-right-overlay"
                              ref={cropEndOverlayRef}
                              style={{ width: `${cropEndPercentage}%` }}
                            />
                        </>
                        ) : (// show cropped recording waveform
                          <>
                            
                            {showCropHandles && !isPlaying && !isRecording && (
                              <>
                                <div 
                                  className="crop-handle crop-handle-left"
                                  onMouseDown={handleCropStartMouseDown}
                                  title="Drag to crop start"
                                />
                                <div 
                                  className="crop-handle crop-handle-right"
                                  onMouseDown={handleCropEndMouseDown}
                                  title="Drag to crop end"
                                />
                              </>
                            )}
                          </>
                        )}
                    </>
                    )}
                  </div>
                </div>
              ) : (
                <div 
                  className="waveform-container empty"
                  onClick={() => {
                    document.getElementById('audio-file-input').click();
                  }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="empty-message">
                    <FontAwesomeIcon icon={faCloudUploadAlt} />
                    <span>Drop audio file here or start recording</span>
                    <input 
                      type="file" 
                      id="audio-file-input" 
                      className="file-upload-input" 
                      accept="audio/*"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
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

        {/* Context Menu */}
        {showContextMenu && (
          <div 
            className="context-menu" 
            style={{ 
              position: 'fixed', 
              top: `${contextMenuPosition.y}px`, 
              left: `${contextMenuPosition.x}px`,
              zIndex: 1000,
              background: 'white',
              boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
              borderRadius: '4px',
              padding: '8px 0'
            }}
          >
            <button 
              onClick={handleDeleteRecording}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              Delete Recording
            </button>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirmation && (
          <div className="modal-overlay active" onClick={(e) => {
            if (e.target.className === 'modal-overlay active') {
              setShowDeleteConfirmation(false);
            }
          }}>
            <div className="modal-content">
              <div className="modal-header">
                <h2 className="modal-title">Confirm Deletion</h2>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete all {takes.length} takes?</p>
                <p>This action cannot be undone.</p>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowDeleteConfirmation(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={deleteRecording}
                >
                  Delete All Recordings
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
} 