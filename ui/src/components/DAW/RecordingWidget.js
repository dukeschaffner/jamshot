'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDuration, renderWaveform } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faPlay, faPause, faStepBackward, faStepForward, faTrash, faUpload, faCloudUploadAlt, faHeadphones } from '@fortawesome/free-solid-svg-icons';
import './DawBody.css';
import './RecordingWidget.css';
import { useAudio } from '../../lib/AudioContext';
export default function RecordingWidget({ 
  isPlaying,
  setIsPlaying,
  isRecording,
  setIsRecording,
  recordingPlaybackBuffer,
  setRecordingPlaybackBuffer,
  selectedAudioInputDevice = null,
  userLatencyCompensation = 0,
  setRecordingGain = null,
  isMetronomeOn = false,  // Add metronome prop
  bpm = 120,            // Add BPM prop with default value
  metronomeVolume = 0.7, // Add metronomeVolume prop with default value
  timeSignature = '4/4', // Add timeSignature prop with default value
  isCountInEnabled = false, // Add isCountInEnabled prop with default value
  metronomeOffset = 0, // Add metronomeOffset prop with default value
  setMetronomeOffset = null, // Add setMetronomeOffset prop with default value
  snapToGridEnabled = false,
  recordingLimit = 60 * 5,
}) {
  const defaultEffectiveDuration = 30;

    //#region audio properties
    const [audioContext, setAudioContext] = useState(null);
    const [takes, setTakes] = useState([]);
    const [selectedTake, setSelectedTake] = useState(null);
    const [playheadTime, setPlayheadTime] = useState(0); //Used to scrub and to set playback start time
    const [isLooping, setIsLooping] = useState(true);
    const [looperLeftPos, setLooperLeftPos] = useState(0);
    const [looperRightPos, setLooperRightPos] = useState(100);
    const [effectiveDuration, setEffectiveDuration] = useState(defaultEffectiveDuration); // Default to 90 seconds (1:30)
    const effectiveDurationRef = useRef(effectiveDuration);
    const playableDuration = selectedTake ? selectedTake.endTime - selectedTake.startTime : effectiveDuration;
    const playableDurationRef = useRef(playableDuration);
    // Add metronome state
    const [metronomeBPM, setMetronomeBPM] = useState(bpm);
    const metronomeHighClickRef = useRef(null);
    const metronomeLowClickRef = useRef(null);
    const metronomeSourcesRef = useRef([]);
    const lastScheduledBeatRef = useRef(0);
    const metronomeGainNodeRef = useRef(null);
    const isMetronomeOnRef = useRef(isMetronomeOn);

    // Add zoom state
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = no zoom, > 1 = zoomed in
    const zoomMax = 10; // Maximum zoom level

    const recordedBufferRef = useRef(null);
    const recordingGainNodeRef = useRef(null);
    const recordingTrackGainRef = useRef(.8);
    const recordingAnalyzerRef = useRef(null);
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
    const absolutePlaybackStartTimeRef = useRef(0);
    //const relativePlaybackStartTimeRef = useRef(0);
    const playheadInternalTimeRef = useRef(0); // Used to hold the playback start time and pause time for resuming playback


    const tempRecordingStartTimeRef1 = useRef(0);
    const tempRecordingStartTimeRef2 = useRef(0);
    //#endregion

    //#region ui properties
    const [playheadPos, setPlayheadPos] = useState(0);
    const [recordingWidth, setRecordingWidth] = useState(0);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [isDraggingLooperLeft, setIsDraggingLooperLeft] = useState(false);
    const [isDraggingLooperRight, setIsDraggingLooperRight] = useState(false);
    const [isDraggingLooperRegion, setIsDraggingLooperRegion] = useState(false);
    const [isDraggingCropStart, setIsDraggingCropStart] = useState(false);
    const [isDraggingCropEnd, setIsDraggingCropEnd] = useState(false);
    const [isDraggingRecordingFader, setIsDraggingRecordingFader] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    // Add state for fader dragging

    const [recordingFaderValue, setRecordingFaderValue] = useState(0.8); // Default to 0.8 (80%)
    const [looperStartWidth, setLooperStartWidth] = useState(0);
    const [looperStartLeft, setLooperStartLeft] = useState(0);
    const [selectedForDeletion, setSelectedForDeletion] = useState(false);
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [showContextMenu, setShowContextMenu] = useState(false);

    const dawHeaderRef = useRef(null);
    const recordingCanvasRef = useRef(null);
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
    const recordingFaderRef = useRef(null);
    const takesCountRef = useRef(0); // Ref to track the number of takes
    const dawTracksContainerRef = useRef(null);
    const musicGridLinesRef = useRef([]); // Holds the music grid lines positions (%)
    const gridSnapThreshold = 0.1; // Threshold for grid snapping. Percentage of beat width
    
    const [cropStartPercentage, setCropStartPercentage] = useState(0);
    const cropStartTimeRef = useRef(0);
    const [cropEndPercentage, setCropEndPercentage] = useState(0);
    const cropEndTimeRef = useRef(0);
    const [showCropHandles, setShowCropHandles] = useState(false);
    //#endregion

    // Add state for metronome offset drag and position
    const [isDraggingMetronomeOffset, setIsDraggingMetronomeOffset] = useState(false);
    const [metronomeOffsetPos, setMetronomeOffsetPos] = useState(0); // Position in %
    const metronomeOffsetHandleRef = useRef(null);

    const {isPlaying: isPlayingGlobal, togglePlayPause: togglePlayPauseGlobal } = useAudio();

    const shouldCountInRef = useRef(false);

    // Helper functions
    const posToTime = (pos, duration) => {
        return (pos / 100) * duration;
    };
    
    const timeToPos = (time, duration) => {
        return (time / duration) * 100;
    };

    // Handle extending duration when recording exceeds current duration
    useEffect(() => {
      if (isRecording) {
        // Set up an interval to check once per second
        const checkDurationInterval = setInterval(() => {
          const currentPlaybackTime = playheadInternalTimeRef.current + (audioContext?.currentTime - absolutePlaybackStartTimeRef.current);
          // If we're approaching the end, extend the duration
          if (currentPlaybackTime + 5 > effectiveDurationRef.current) {  // Add 5 second buffer
            setEffectiveDuration(prev => prev + 30); // Extend by 30 seconds
            console.log('effectiveDuration extended:', effectiveDurationRef.current);
          }
          if(currentPlaybackTime > recordingLimit - 1){
            setIsRecording(false);
            alert('Recording limit reached');
          }
        }, 1000); // Check every 1000ms (1 second)
        
        // Clean up interval on unmount or when recording stops
        return () => clearInterval(checkDurationInterval);
      }
    }, [isRecording]);

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
          
          const recordingAnalyzer = newAudioContext.createAnalyser();
          recordingAnalyzer.fftSize = 2048;
          recordingAnalyzer.smoothingTimeConstant = 0.8;
          recordingAnalyzerRef.current = recordingAnalyzer;
          
          const inputAnalyzer = newAudioContext.createAnalyser();
          inputAnalyzer.fftSize = 2048;
          inputAnalyzer.smoothingTimeConstant = 0.8;
          inputAnalyzerRef.current = inputAnalyzer;

          // Create metronome sounds
          createMetronomeSounds(newAudioContext);

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
      effectiveDurationRef.current = effectiveDuration;
    }, [effectiveDuration]);

    useEffect(() => {
      isMetronomeOnRef.current = isMetronomeOn;
    }, [isMetronomeOn]);

    useEffect(() => {
      playableDurationRef.current = playableDuration;
    }, [playableDuration]);

  // Play back the recorded audio synchronized with the original track (if in collab mode)
  const play = () => {
    if (!audioContext) {
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

    // Play recording buffer if available and not recording
    if (!isRecording && recordingPlaybackBuffer) {
      const recordedGain = audioContext.createGain();
      recordedGain.gain.value = recordingTrackGainRef.current;
      
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
    if(isRecording){
      startTime = 0;
      setPlayheadTime(startTime);
      setPlayheadPos(0);
      playheadInternalTimeRef.current = startTime;
      if(effectiveDurationRef.current !== defaultEffectiveDuration){
        setEffectiveDuration(defaultEffectiveDuration);
      }
    }
    else if(isLooping){
        startTime = posToTime(looperLeftPos, effectiveDuration);
        setPlayheadTime(startTime);
        setPlayheadPos(looperLeftPos);
        playheadInternalTimeRef.current = startTime;
    }
    else{
        startTime = playheadInternalTimeRef.current;
    }

    let scheduledStartTime = audioContext.currentTime;
     if(shouldCountInRef.current){
       const beatsPerMeasure = parseInt(timeSignature.split('/')[0], 10);
       const secondsPerBeat = 60 / metronomeBPM;
       const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
       scheduledStartTime += secondsPerMeasure;
       shouldCountInRef.current = false;
     }
    
    // Start playback for each source
    activeSources.forEach(source => {
      source.start(scheduledStartTime, startTime);
    });
    
    if(isRecording){
      setRecordingWidth(0);
    }

    absolutePlaybackStartTimeRef.current = scheduledStartTime;
    console.log('Absolute playback start time set:', absolutePlaybackStartTimeRef.current);

    // Schedule metronome clicks if metronome is on
    if (isMetronomeOnRef.current) {
      stopAndClearMetronomeClicks();
      scheduleMetronomeClicks();
    }

    // Enable the play button when playback is complete
    if (activeSources.length > 0) {
      activeSources[0].onended = function() {
        const currentPlaybackTime = isPlayingRef.current ? playheadInternalTimeRef.current + (audioContext.currentTime - absolutePlaybackStartTimeRef.current) : playheadInternalTimeRef.current;
        if(!isRecording && currentPlaybackTime >= playableDuration){ //Ended naturally, no looping
          if(isLooping){ //Go to the start of the looper
            seekToTime(posToTime(looperLeftPos, playableDuration));
          }
          else{
            playheadInternalTimeRef.current = 0;
            setIsPlaying(false);
            activeSourcesRef.current = [];
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
      recordingGainNodeRef.current = null;
    }

    // Stop all metronome sources
    metronomeSourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (error) {
        // Source may have already stopped
      }
    });
    metronomeSourcesRef.current = [];
    
    setIsPlaying(false);
  };

  const seekToTime = (time) => {
    // Update the playhead position and time
    setPlayheadTime(time);
    setPlayheadPos(timeToPos(time, playableDuration));
    
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
      
      // Stop all metronome sources
      metronomeSourcesRef.current.forEach(source => {
        try {
          source.stop();
          source.disconnect();
        } catch (error) {
          // Source may have already stopped
        }
      });
      metronomeSourcesRef.current = [];
      
      // Clear the active sources array
      activeSourcesRef.current = [];
      
      // Directly call play to restart at the new position
      // This avoids toggling isPlaying state
      play();
    }
  };
  
  const startRecording = async () => {
    if (!isRecording || !audioContext) return;

    if(isCountInEnabled){
      shouldCountInRef.current = true;
    }
    
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
      console.log('Absolute recording start time set:', absoluteRecordingStartTimeRef.current);
      
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

      const recordingLatency = !isFile ? audioContext.outputLatency + (absolutePlaybackStartTimeRef.current - tempRecordingStartTimeRef2.current) : 0;

      console.log('Input latency point 1:', absolutePlaybackStartTimeRef.current - tempRecordingStartTimeRef1.current, 'seconds');
      console.log('Input latency point 2:', absolutePlaybackStartTimeRef.current - absoluteRecordingStartTimeRef.current, 'seconds');
      console.log('Input latency based on buffer:', absolutePlaybackStartTimeRef.current - tempRecordingStartTimeRef2.current, 'seconds');
      console.log('output latency:', audioContext.outputLatency, 'seconds');
      
      // Trim the buffer to account for recording latency
      if (!isFile && recordingLatency > 0) {
        // Calculate how many samples to trim from the beginning
        const samplesToTrim = Math.floor(recordingLatency * buffer.sampleRate);
        
        if (samplesToTrim > 0 && samplesToTrim < buffer.length) {
          // Create a new buffer with the trimmed length
          const trimmedBuffer = audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length - samplesToTrim,
            buffer.sampleRate
          );
          
          // Copy the data from the original buffer, skipping the latency portion
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const originalData = buffer.getChannelData(channel);
            const trimmedData = trimmedBuffer.getChannelData(channel);
            
            for (let i = 0; i < trimmedBuffer.length; i++) {
              trimmedData[i] = originalData[i + samplesToTrim];
            }
          }
          
          // Replace the original buffer with the trimmed one
          buffer = trimmedBuffer;
          console.log(`Trimmed ${samplesToTrim} samples (${recordingLatency.toFixed(3)}s) from recording to compensate for latency`);
        }
      }

      // Create a take with the high-quality WAV data
      const takeNumber = takes.length + 1;
      const newTake = {
        id: Date.now().toString(),
        name: `Take ${takeNumber}`,
        buffer: buffer,
        recordedAt: Date.now(),
        startTime: 0, //time relative to time=0 of DAW. IE the time in the DAW that the audio starts
        endTime: buffer.duration, //time relative to time=0 of DAW
        timeOffset: 0, //time offset of the recording audio relative to the startTime
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

  // Update the stopRecording function to create a take
  const stopRecording = () => {
    if (isRecording || !audioContext) return;
    
    isRecordingRef.current = false;
    shouldCountInRef.current = false;
    
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
      const adjustedAbsoluteStartTime = selectedTake.startTime - userLatencyCompensation / 1000;
        
      const startSample = Math.floor(adjustedAbsoluteStartTime * recordedBuffer.sampleRate);
      const endSample = Math.floor(selectedTake.endTime * recordedBuffer.sampleRate); 
      // Calculate the number of samples in the trimmed buffer
      const numSamples = endSample - startSample;
      
      // Create a new buffer with the same number of channels but only the selected portion
      const trimmedBuffer = audioContext.createBuffer(
          recordedBuffer.numberOfChannels,
          numSamples,
          recordedBuffer.sampleRate
      );
      
      // Copy the selected portion of each channel to the new buffer
      for (let channel = 0; channel < recordedBuffer.numberOfChannels; channel++) {
          const originalData = recordedBuffer.getChannelData(channel);
          const trimmedData = trimmedBuffer.getChannelData(channel);
          
          for (let i = 0; i < numSamples; i++) {
              trimmedData[i] = originalData[startSample + i];
          }
      }
      
      return trimmedBuffer;
    };
    
    // Check if we have a selected take
    if(selectedTake) {
      let recordedBuffer = createRecordingPlaybackBuffer(selectedTake);
      setRecordingPlaybackBuffer(recordedBuffer);

      if (recordingCanvasRef.current) {
        renderWaveform(selectedTake.buffer, recordingCanvasRef, null, null, zoomLevel);
      }
    }
  }, [selectedTake, userLatencyCompensation]);

  //#endregion
  

  // Update playhead position when playback starts
  useEffect(() => {
    if (isPlaying) {
      const updatePlayhead = () => {
        const currentTime = playheadInternalTimeRef.current + (audioContext.currentTime - absolutePlaybackStartTimeRef.current);
        if(currentTime > 0){ //animate the playhead during playback and if any part of the count in is in t > 0
          let playheadPos = timeToPos(currentTime, playableDuration);
          if(isLooping && playheadPos >= looperRightPos && !isRecording){ //Go to the start of the looper
            seekToTime(posToTime(looperLeftPos, playableDuration));
          }
          else{
            // Update recording indicator width when recording
            if (isRecording) {
              playheadPos = timeToPos(currentTime, effectiveDurationRef.current);
              const indicatorWidth = playheadPos;
              setRecordingWidth(indicatorWidth > 0 ? indicatorWidth : 0);
            }
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
  }, [isPlaying, playableDuration]);


  // Handle waveform click
  const handleWaveformClick = (e) => {
      if (!recordingContainerRef.current || isRecording) return;
      
      // Calculate click position based on recording container and crop percentages
      const recordingRect = recordingContainerRef.current.getBoundingClientRect();
      const recordingStartX = recordingRect.left;
      const recordingWidth = recordingRect.width;
      
      // Calculate the visible area boundaries based on crop percentages
      const cropStartX = recordingStartX + (cropStartPercentage / 100) * recordingWidth;
      const cropEndX = recordingRect.right - (cropEndPercentage / 100) * recordingWidth;
      
      // Calculate click position within the visible area
      const clickPos = Math.max(0, Math.min(100, ((e.clientX - cropStartX) / (cropEndX - cropStartX)) * 100));
      
      seekToTime(posToTime(clickPos, playableDuration));
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


  useEffect(() => {
    if(selectedTake){
      recordedBufferRef.current = selectedTake.buffer;
    }
  }, [selectedTake, effectiveDuration]);

    // Mouse event handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
          if (!isDraggingLooperLeft && !isDraggingLooperRight && !isDraggingPlayhead && !isDraggingLooperRegion && !isDraggingCropStart && !isDraggingCropEnd && !isDraggingMetronomeOffset && !isDraggingRecordingFader) return;
          
        const playableSectionRect = dawHeaderRef.current.getBoundingClientRect();
        const mousePos = Math.max(0, Math.min(100, ((e.clientX - playableSectionRect.left) / playableSectionRect.width) * 100));
        
        // Dragging playhead
        if (isDraggingPlayhead) {
          setPlayheadPos(mousePos);
          playheadInternalTimeRef.current = posToTime(mousePos, playableDuration);
        }
        
        // Dragging left looper handle
        if (isDraggingLooperLeft) {
          const newLeftPos = Math.max(0, Math.min(looperRightPos - 5, mousePos));
          const snappedLeftPos = snapToGrid(newLeftPos);
          setLooperLeftPos(snappedLeftPos); 
        }
        
        // Dragging right looper handle
        if (isDraggingLooperRight) {
          const newRightPos = Math.max(looperLeftPos + 5, Math.min(100, mousePos));
          const snappedRightPos = snapToGrid(newRightPos);
          setLooperRightPos(snappedRightPos);
        }
        
        // Dragging entire looper region
        if (isDraggingLooperRegion) {
          const deltaX = e.clientX - dragStartX;
          const deltaPercent = (deltaX / playableSectionRect.width) * 100;
          
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
              
        }
        
        // Handle crop start dragging
        if (isDraggingCropStart && selectedTake) {
          // Calculate crop position within the recording region
          const recordingRect = recordingContainerRef.current.getBoundingClientRect();
          const recordingStartX = recordingRect.left;
          const recordingWidth = recordingRect.width;
          
          // Calculate crop end position based on crop percentage instead of getBoundingClientRect
          const cropEndX = recordingRect.right - (cropEndPercentage / 100) * recordingWidth;
          
          const trackStartX = recordingStartX;
          const buffer = 5 * (recordingWidth / 100);
          var newCropX = 0;
          if(e.clientX < trackStartX) { //Do not allow user to crop beyond track start
            newCropX = trackStartX;
          }
          else if(e.clientX > cropEndX - buffer){ //Do not allow user to crop beyond crop end
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

          cropStartTimeRef.current = posToTime((newCropX - trackStartX) / recordingWidth * 100, effectiveDuration);
        }
        
        // Handle crop end dragging
        if (isDraggingCropEnd && selectedTake) {
          // Calculate crop position within the recording region
          const recordingRect = recordingContainerRef.current.getBoundingClientRect();
          const recordingStartX = recordingRect.left;
          const recordingEndX = recordingRect.right;
          const recordingWidth = recordingRect.width;
          
          // Calculate crop start position based on crop percentage instead of getBoundingClientRect
          const cropStartX = recordingStartX + (cropStartPercentage / 100) * recordingWidth;
          
          const trackStartX = recordingStartX;
          const trackEndX = recordingEndX;
          const buffer = 5 * (recordingWidth / 100);
          var newCropX = 0;
          if(e.clientX > trackEndX) { //Do not allow user to crop beyond track end
            newCropX = trackEndX;
          }
          else if(e.clientX < cropStartX + buffer){ //Do not allow user to crop beyond crop start
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

          cropEndTimeRef.current = posToTime((newCropX - trackStartX) / recordingWidth * 100, effectiveDuration);
        }
        
        // Handle recording fader dragging
        if (isDraggingRecordingFader) {
          // Calculate the new gain value (0 to 1 range)
          const faderRect = recordingFaderRef.current.getBoundingClientRect();
          const newMousePos = Math.max(0, Math.min(100, ((e.clientX - faderRect.left) / faderRect.width) * 100));
          const newGain = Math.min(1, Math.max(0, newMousePos / 100));
          setRecordingFaderValue(newGain);
        }

        // Handle metronome offset dragging
        if (isDraggingMetronomeOffset) {
          // Calculate the position of one measure
          const bpm = metronomeBPM;
          const beatsPerMeasure = parseInt(timeSignature.split('/')[0], 10);
          const secondsPerBeat = 60 / bpm;
          const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
          const measurePos = timeToPos(secondsPerMeasure, playableDurationRef.current);
          
          // Limit the drag to be within 0% (left edge) and one measure
          const newOffsetPos = Math.max(0, Math.min(measurePos, mousePos));
          
          // Update offset in seconds
          const offsetPercent = Math.min(Math.max(parseFloat(newOffsetPos / measurePos), 0), 1);
          
          // Notify parent component if callback provided
          if (setMetronomeOffset) {
            setMetronomeOffset(offsetPercent);
          }
        }
      };
        
        const handleMouseUp = (e) => {
            //stop propagation
            e.stopPropagation();
          setIsDraggingLooperLeft(false);
          setIsDraggingLooperRight(false);
          setIsDraggingLooperRegion(false);
          setIsDraggingMetronomeOffset(false);

          if(isDraggingPlayhead){
            seekToTime(playheadInternalTimeRef.current);
            setIsDraggingPlayhead(false);
          }
  
          // If we were dragging crop handles, update the recording
          if (isDraggingCropStart && selectedTake) 
          {
            setSelectedTake(prevTake => ({
                ...prevTake,
                startTime: cropStartTimeRef.current
            }));
            setTakes(prevTakes => prevTakes.map(take => take.id === selectedTake.id ? {...take, startTime: cropStartTimeRef.current} : take));
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
          // Handle fader dragging end
          setIsDraggingRecordingFader(false);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }, [
        isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion, 
        isDraggingCropStart, isDraggingCropEnd, isDraggingRecordingFader, isDraggingMetronomeOffset,
        looperLeftPos, looperRightPos, dragStartX, looperStartLeft, looperStartWidth,
        isPlaying, playheadPos, isLooping, 
        selectedTake, recordingPlaybackBuffer, cropStartPercentage, cropEndPercentage,
        recordingFaderValue, metronomeBPM, effectiveDuration
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
        };
        updateVisuals();

    }, [looperLeftPos, looperRightPos, isLooping]);


  // Determine if recording track has content
  const hasRecordingTrack = recordedBufferRef.current !== null || selectedTake !== null;
  
  // Generate dynamic time markers based on track duration and zoom level
  const generateTimeMarkers = () => {
    if(!dawTracksContainerRef.current) return;
    const markers = [];
      
    // Determine appropriate interval based on track duration
    let interval; // in seconds
    let numMarkers;

    const projectWidth = dawTracksContainerRef.current.getBoundingClientRect().width;
    const minPixelsPerMarker = 100;
    const secondsPerPixel = effectiveDuration / projectWidth;

    const playableDuration = (selectedTake && !isRecording) ? selectedTake.endTime - selectedTake.startTime : effectiveDuration;

    const intervals = [0.1, 0.5, 1, 5, 10, 30, 60, 120];

    for(let i = 0; i < intervals.length; i++){
      if(secondsPerPixel * minPixelsPerMarker <= intervals[i]){
        interval = intervals[i];
        break;
      }
    }

    const precision = interval < 1 ? 1 : 0;
    numMarkers = Math.ceil(playableDuration / interval) + 1;
      
      
    // Always include start marker
    markers.push(
      <div 
        key="marker-start" 
        className="time-marker time-marker-start" 
        style={{ left: '0%' }}
      >
        {formatDuration(0, precision)}
      </div>
    );
      
    // Add intermediate markers
    for (let i = 1; i < numMarkers - 1; i++) {
      const time = i * interval;
      if (time < playableDuration) { // Only add if within track duration
              const percentage = timeToPos(time, playableDuration);
              markers.push(
                  <div 
                      key={`marker-${i}`} 
            className="time-marker time-marker-mid" 
                      style={{ left: `${percentage}%` }}
                  >
                      {formatDuration(time, precision)}
                  </div>
              );
          }
      }
    
    // Always include end marker (unless it's very close to the last interval marker)
    const lastIntervalTime = (numMarkers - 1) * interval;
    if (Math.abs(playableDuration - lastIntervalTime) > interval / 5) {
      markers.push(
        <div 
          key="marker-end" 
          className="time-marker time-marker-end" 
          style={{ left: '100%' }}
        >
          {formatDuration(playableDuration, 1)}
        </div>
      );
    }
      
      return markers;
  };

  const snapToGrid = (value) => {
    if(snapToGridEnabled){
      // If grid lines aren't generated yet, return the original value
      if (!musicGridLinesRef.current || musicGridLinesRef.current.length === 0) {
        return value;
      }
      
      // Find the closest grid line
      let closestGridLine = value;
      let minDistance = Infinity;

      const secondsPerBeat = 60 / bpm;
      const duration = (selectedTake && !isRecording) ? playableDurationRef.current : effectiveDurationRef.current;
      const beatWidthPos = timeToPos(secondsPerBeat, duration);
      const calculatedGridSnapThreshold = beatWidthPos * gridSnapThreshold;
      
      for (const gridLinePos of musicGridLinesRef.current) {
        const distance = Math.abs(gridLinePos - value);
        if (distance < minDistance) {
          minDistance = distance;
          closestGridLine = gridLinePos;
        }
      }
      
      // Only snap if the distance is less than the threshold
      if (minDistance <= calculatedGridSnapThreshold) {
        return closestGridLine;
      }
    }
    
    // Return original value if not snapping
    return value;
  };
  
  // Generate musical grid lines based on BPM and time signature, accounting for zoom
  const generateMusicalGrid = () => {
      const gridLinesPositions = [];

      const bpm = metronomeBPM; // Use the metronome BPM
      const beatsPerMeasure = timeSignature.split('/')[0];
      const duration = (selectedTake && !isRecording) ? playableDurationRef.current : effectiveDurationRef.current;

      
      // Calculate seconds per beat and seconds per measure
      const secondsPerBeat = 60 / bpm;
      const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
      const offsetSeconds = posToTime(metronomeOffsetPos, duration);
      
      const gridLines = [];
      
      // Calculate how many measures fit in the track
      const totalMeasures = Math.ceil((duration - offsetSeconds) / secondsPerMeasure);
      
      // Generate measure lines (strong grid lines)
      for (let measure = 0; measure <= totalMeasures; measure++) {
        const measureTime = measure * secondsPerMeasure + offsetSeconds;
        if (measureTime <= duration) {
          const position = timeToPos(measureTime, duration);
          gridLinesPositions.push(position);
          gridLines.push(
            <div 
              key={`measure-${measure}`} 
              className={`grid-line measure-line`}
              style={{ left: `${position}%` }}
              title={`Measure ${measure + 1}`}
            />
          );
        }
      }

      const startBeat = beatsPerMeasure - Math.floor(offsetSeconds / secondsPerBeat);
      const startBeatOffset = offsetSeconds % secondsPerBeat;
      const endBeat = startBeat + Math.floor((duration - startBeatOffset) / secondsPerBeat);
      
      // Generate beat lines (weaker grid lines)
      for (let beat = startBeat; beat <= endBeat; beat++) {
        // Skip beats that fall on measure boundaries (already covered by measure lines)
        if (beat % beatsPerMeasure !== 0) {
          const beatTime = (beat - startBeat) * secondsPerBeat + startBeatOffset;
          if (beatTime <= duration) {
            const position = timeToPos(beatTime, duration);
            gridLinesPositions.push(position);
            gridLines.push(
              <div 
                key={`beat-${beat}`} 
                className={`grid-line beat-line`}
                style={{ left: `${position}%` }}
                title={`Beat ${(beat % beatsPerMeasure) + 1}`}
              />
            );
          }
        }
      }

      // Update the music grid lines positions
      musicGridLinesRef.current = gridLinesPositions;
      
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

      if(fileBuffer.duration > recordingLimit){
        const formattedRecordingLimit = formatDuration(recordingLimit);
        alert(`File duration exceeds the maximum recording limit of ${formattedRecordingLimit}.`);
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

      if(fileBuffer.duration > recordingLimit){
        const formattedRecordingLimit = formatDuration(recordingLimit);
        alert(`File duration exceeds the maximum recording limit of ${formattedRecordingLimit}.`);
        return;
      }
      
      // Create a take from the file
      createTakeFromRecordedBuffer(fileBuffer, true);
    } catch (error) {
      console.error('Error processing dropped file:', error);
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
        
        // Update recording track meter during playback
        if (recordingAnalyzerRef.current && isPlayingRef.current && !isRecordingRef.current) {
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
  const hasAudioContent = hasRecordingTrack;

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

  const handleZoomChange = (e) => {
    const newZoomLevel = parseFloat(e.target.value);
    setZoomLevel(newZoomLevel);
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
    if (isPlaying || isRecording || !selectedTake) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const cropStartPixels = cropStartPercentage * rect.width;
    const cropEndPixels = cropEndPercentage * rect.width;
    const leftEdgeZone = rect.left + cropStartPixels + 15; // 15px from left edge
    const rightEdgeZone = rect.right - cropEndPixels - 15; // 15px from right edge
    
    // If mouse is close to either edge, show the crop handles
    const isNearEdge = e.clientX < leftEdgeZone || e.clientX > rightEdgeZone;
    setShowCropHandles(isNearEdge);
    
    // Update cursor based on position
    if (e.clientX < leftEdgeZone) {
      e.currentTarget.style.cursor = 'col-resize';
    } else if (e.clientX > rightEdgeZone) {
      e.currentTarget.style.cursor = 'col-resize';
    } else {
      e.currentTarget.style.cursor = 'default';
    }
  };

  const handleRecordingMouseLeave = () => {
    setShowCropHandles(false);
  };

  // Initialize crop state when a take is selected
  useEffect(() => {
    if (selectedTake) {
      const cropStartTime = selectedTake.startTime;
      const cropEndTime = selectedTake.endTime;
      setCropStartPercentage(cropStartTime / selectedTake.buffer.duration * 100);
      setCropEndPercentage((selectedTake.buffer.duration - cropEndTime) / selectedTake.buffer.duration * 100);
      setEffectiveDuration(selectedTake.buffer.duration);
    }
  }, [selectedTake]);

  // Update the recordingTrackGainRef when recordingFaderValue changes
  useEffect(() => {
    recordingTrackGainRef.current = recordingFaderValue;
    
    // Update parent component with gain value if provided
    if (setRecordingGain) {
      setRecordingGain(recordingFaderValue);
    }
    
    // If playing, update the gain value in real-time
    if (isPlaying && recordingGainNodeRef.current && audioContext) {
      recordingGainNodeRef.current.gain.setValueAtTime(recordingFaderValue, audioContext.currentTime);
      recordingGainNodeRef.current.gain.linearRampToValueAtTime(recordingFaderValue, audioContext.currentTime + 0.05);
    }
  }, [recordingFaderValue, isPlaying, audioContext, setRecordingGain]);

  // Initialize fader values from refs
  useEffect(() => {
    setRecordingFaderValue(recordingTrackGainRef.current);
  }, []);

  // Handle recording fader mouse down
  const handleRecordingFaderMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingRecordingFader(true);
    setDragStartX(e.clientX);
  };

  // Create metronome click sounds when audio context is initialized
  const createMetronomeSounds = (context) => {
    // Create high click (downbeat)
    const highClickBuffer = context.createBuffer(1, context.sampleRate * 0.05, context.sampleRate);
    const highClickChannel = highClickBuffer.getChannelData(0);
    
    // Create sine wave with quick decay for high click (downbeat)
    for (let i = 0; i < highClickBuffer.length; i++) {
      // Pitch - higher for first beat (accent)
      const frequency = 1600; 
      // Exponential decay
      const decay = Math.exp(-5 * i / highClickBuffer.length);
      // Apply sine wave with decay
      highClickChannel[i] = Math.sin(2 * Math.PI * frequency * i / context.sampleRate) * decay;
    }
    
    // Create low click (other beats)
    const lowClickBuffer = context.createBuffer(1, context.sampleRate * 0.03, context.sampleRate);
    const lowClickChannel = lowClickBuffer.getChannelData(0);
    
    // Create sine wave with quick decay for low click (other beats)
    for (let i = 0; i < lowClickBuffer.length; i++) {
      // Pitch - lower for other beats
      const frequency = 900; 
      // Exponential decay
      const decay = Math.exp(-10 * i / lowClickBuffer.length);
      // Apply sine wave with decay
      lowClickChannel[i] = Math.sin(2 * Math.PI * frequency * i / context.sampleRate) * decay;
    }
    
    // Store the click buffers
    metronomeHighClickRef.current = highClickBuffer;
    metronomeLowClickRef.current = lowClickBuffer;

    // Create gain node for metronome volume control
    const gainNode = context.createGain();
    gainNode.gain.value = metronomeVolume;
    gainNode.connect(context.destination);
    metronomeGainNodeRef.current = gainNode;
  };
  
  useEffect(() => {
    let scheduleInterval;
    
    if(isMetronomeOn){
      // Set up an interval to schedule more metronome clicks ahead of time
      scheduleInterval = setInterval(() => {
        if (!isPlayingRef.current) {
          clearInterval(scheduleInterval);
          return;
        }
    
        scheduleMetronomeClicks();
      }, 100); // Check every 100ms
    }
    else{
      stopAndClearMetronomeClicks();
    }
    
    // Clean up function to clear the interval when the component unmounts
    // or when isMetronomeOn changes to false
    return () => {
      if (scheduleInterval) {
        clearInterval(scheduleInterval);
      }
    };
  }, [isMetronomeOn, isPlayingRef.current]);

  // Schedule metronome clicks for the next few beats
  const scheduleMetronomeClicks = () => {
    if (!isMetronomeOn || !audioContext) return;

    const duration = !isRecording ? playableDurationRef.current : effectiveDurationRef.current;
    
    const beatsPerMeasure = parseInt(timeSignature.split('/')[0], 10);
    const secondsPerBeat = 60 / metronomeBPM;
    const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
    const offsetSeconds = posToTime(metronomeOffsetPos, duration);
    
    // Calculate the current beat based on playhead position, adjusting for the offset
    const currentPlaybackTime = playheadInternalTimeRef.current + (audioContext?.currentTime - absolutePlaybackStartTimeRef.current);
    // Adjust the beat calculation by the offset time
    const adjustedTime = currentPlaybackTime + (secondsPerMeasure - offsetSeconds);
    const nextPlayheadBeat = Math.ceil(adjustedTime * metronomeBPM / 60);
    
    if(lastScheduledBeatRef.current > nextPlayheadBeat + 2){
      return; // If the last scheduled beat is more than 2 beats ahead of the next playhead beat, don't schedule any more
    } 

    const firstBeatToSchedule = nextPlayheadBeat >= lastScheduledBeatRef.current ? nextPlayheadBeat : lastScheduledBeatRef.current + 1;
    // Add the offset back when calculating the actual time to schedule
    const firstBeatToScheduleTime = audioContext.currentTime + (firstBeatToSchedule * secondsPerBeat - adjustedTime);
    
    // Schedule several beats ahead (look-ahead window - 2 measures)
    const beatsToSchedule = beatsPerMeasure * 2;
    
    for (let i = 0; i < beatsToSchedule; i++) {
      const beatNumber = (firstBeatToSchedule + i) % beatsPerMeasure;
      const beatTime = firstBeatToScheduleTime + (i * secondsPerBeat);
      
      // Use high click for first beat of measure, low click for others
      const clickBuffer = beatNumber === 0 ? metronomeHighClickRef.current : metronomeLowClickRef.current;
      
      if (!clickBuffer) continue; // Skip if buffer not loaded yet
      
      // Create source and schedule it
      const clickSource = audioContext.createBufferSource();
      clickSource.buffer = clickBuffer;
      
      // Connect to gain node for volume control
      clickSource.connect(metronomeGainNodeRef.current);
      
      // Schedule the click
      clickSource.start(beatTime);
      
      // Store reference to stop later if needed
      metronomeSourcesRef.current.push(clickSource);
      
      // Update the next scheduled beat
      lastScheduledBeatRef.current = firstBeatToSchedule + i;
    }
    console.log("Scheduled beats: ", beatsToSchedule);
  };

  const stopAndClearMetronomeClicks = () => {
    metronomeSourcesRef.current.forEach(source => {
      source.stop();
      source.disconnect();
    });
    metronomeSourcesRef.current = [];
    lastScheduledBeatRef.current = 0;
  };

  // Update metronome volume when volume state changes
  useEffect(() => {
    if (metronomeGainNodeRef.current) {
      metronomeGainNodeRef.current.gain.value = metronomeVolume;
    }
  }, [metronomeVolume]);

  // Update BPM when prop changes
  useEffect(() => {
    setMetronomeBPM(bpm);
  }, [bpm]);

  // Add metronome offset handle mouse down handler
  const handleMetronomeOffsetMouseDown = (e) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsDraggingMetronomeOffset(true);
  };

  // When metronomeOffset prop changes, update state
  useEffect(() => {
    if (metronomeOffset !== undefined) {
      const beatsPerMeasure = parseInt(timeSignature.split('/')[0], 10);
      const secondsPerBeat = 60 / metronomeBPM;
      const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;

      const duration = !isRecording ? playableDuration : effectiveDuration;
      const offsetPos = timeToPos(metronomeOffset * secondsPerMeasure, duration);
      setMetronomeOffsetPos(offsetPos);
    }
  }, [metronomeOffset, metronomeBPM, effectiveDuration, isRecording]);

  return (
    <div className="daw-container">
        <div className="daw-body">
            <div className="daw-tracks-headers">
                <div className="track-label">
                  <span>Your Recording</span>
                  {isRecording && (
                    <div className="recording-indicator">
                      <FontAwesomeIcon icon={faMicrophone} />
                      <span>Recording</span>
                    </div>
                  )}
                  
                  {/* Recording Track Meter */}
                  <div 
                    className="audio-meter-container" 
                    ref={recordingFaderRef}>
                    <div 
                      className="audio-meter-bar" 
                      style={{ 
                        width: `${dbToPercent(isRecording ? inputLevel : recordingTrackLevel)}%`,
                        backgroundColor: getMeterColor(isRecording ? inputLevel : recordingTrackLevel)
                      }}
                    ></div>
                    {/* Add fader handle - only shown if not recording and there's a track to control */}
                    {!isRecording && recordingPlaybackBuffer && (
                      <>
                          <div 
                            className={`fader-handle ${isRecording ? 'disabled' : ''}`}
                            style={{ 
                                left: `${recordingFaderValue * 100}%`,
                                backgroundColor: isDraggingRecordingFader ? 'var(--seafoam)' : 'rgba(255, 255, 255, 0.7)'
                            }}
                            onMouseDown={handleRecordingFaderMouseDown}
                            title={`Volume: ${Math.round(recordingFaderValue * 100)}%`}
                          ></div>
                          <div className="volume-indicator" style={{ left: `${recordingFaderValue * 100}%` }}>
                              {Math.round(recordingFaderValue * 100)}%
                          </div>
                      </>
                    )}
                  </div>
                </div>
            </div>

            <div 
              className="tracks-scroll-container" 
            >
              <div 
                className="daw-tracks-container"
                ref={dawTracksContainerRef}
                style={{ 
                  width: zoomLevel > 1 ? `${100 * zoomLevel}%` : '100%'
                }}
              >
                <div 
                  className={`timeline ${zoomLevel > 1 ? 'zoomed' : ''}`} 
                  ref={dawHeaderRef}
                  style={{ 
                    left: `${selectedTake && !isRecording ? timeToPos(selectedTake.startTime, effectiveDuration) : 0}%`,
                    width: `${selectedTake && !isRecording ? timeToPos(selectedTake.endTime, effectiveDuration) - timeToPos(selectedTake.startTime, effectiveDuration) : 100}%`,
                  }}
                >
                  <div className="metronome-offset-controls">
                    {isMetronomeOn && (
                      <div 
                        className="metronome-offset-handle" 
                        ref={metronomeOffsetHandleRef}
                        style={{ 
                          left: `${metronomeOffsetPos}%`,
                          cursor: isPlaying ? 'not-allowed' : 'ew-resize',
                          position: 'absolute',
                          top: '0',
                          width: '12px',
                          height: '12px',
                          transform: 'translateX(-50%)',
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: '12px solid var(--seafoam)',
                          zIndex: 15,
                          opacity: 0.8,
                          transition: isDraggingMetronomeOffset ? 'none' : 'opacity 0.2s ease'
                        }}
                        onMouseDown={handleMetronomeOffsetMouseDown}
                        onMouseOver={() => metronomeOffsetHandleRef.current.style.opacity = '1'}
                        onMouseOut={() => metronomeOffsetHandleRef.current.style.opacity = '0.8'}
                      />
                    )}
                  </div>
                {/* Playhead */}
                {hasAudioContent && (
                    <div 
                        className="playhead" 
                        ref={playheadRef}
                        onMouseDown={handlePlayheadMouseDown}
                        style={{ left: `${playheadPos}%`, height: `${24 + 116}px` }}
                    ></div>
                )}
                {/* Timeline */}
                <div className="track-label"></div>
                <div className="time-markers">
                    {generateTimeMarkers()}
                </div>

                {/* Musical Grid */}
                <div className="musical-grid">
                    {generateMusicalGrid()}
                </div>

                {/* Looper - Only show if there's audio content */}
                {hasAudioContent && !isRecording && (
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
                  {/* Recording Track - shown in both modes */}
                  <div className={`track-container your-track`} ref={recordingTrackContainerRef}>
                    {hasRecordingTrack || isRecording ? (
                      <div 
                        className={`waveform-container 
                          ${isPlaying ? 'playing' : ''}
                          ${isRecording ? 'recording' : ''}
                          ${isDraggingCropStart || isDraggingCropEnd ? 'cropping' : ''}
                        `}
                        style={{
                          left: `0%`,
                          width: `${isRecording ? recordingWidth : '100'}%`,
                          cursor: isPlaying || isRecording ? 'default' : (
                            showCropHandles ? 'col-resize' : 'default'
                          )
                        }}
                        onClick={handleWaveformClick}
                        onMouseMove={handleRecordingMouseMove}
                        onMouseLeave={handleRecordingMouseLeave}
                        onContextMenu={handleRecordingContextMenu}
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
                                  style={{ width: '100%', height: '100%'}}
                              />

                              {/* Show crop status indicator when cropping */}
                              {(isDraggingCropStart || isDraggingCropEnd) && (
                                <div className="crop-status">
                                  Cropping: {isDraggingCropStart ? "Start" : "End"}
                                </div>
                              )}
                                <div 
                                  className="crop-left-overlay"
                                  ref={cropStartOverlayRef}
                                style={{ width: `${cropStartPercentage}%`, display: cropStartPercentage > 0 ? 'block' : 'none'}}
                              />
                              <div 
                                className="crop-right-overlay"
                                ref={cropEndOverlayRef}
                                style={{ width: `${cropEndPercentage}%`, display: cropEndPercentage > 0 ? 'block' : 'none'}}
                              />
                              {showCropHandles && !isPlaying && !isRecording && (
                                <>
                                  <div 
                                    className="crop-handle crop-handle-left"
                                    onMouseDown={handleCropStartMouseDown}
                                    title="Drag to crop start"
                                    style={{ left: `${cropStartPercentage}%` }}
                                  />
                                  <div 
                                    className="crop-handle crop-handle-right"
                                    onMouseDown={handleCropEndMouseDown}
                                    title="Drag to crop end"
                                    style={{ right: `${cropEndPercentage}%` }}
                                  />
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
          </div>

            {/* Zoom control */}
            <div className="zoom-control">
                <span className="zoom-label">Zoom: {zoomLevel.toFixed(1)}x</span>
                <input 
                    type="range" 
                    min="1" 
                    max={zoomMax} 
                    step="0.1" 
                    value={zoomLevel}
                    onChange={handleZoomChange}
                    className="zoom-slider"
                />
                <button 
                    className="zoom-reset-btn" 
                    onClick={() => { setZoomLevel(1);}}
                    title="Reset zoom"
                >
                    1:1
                </button>
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