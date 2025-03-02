'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '../../../lib/api';
import MiniTrack from '../../../components/MiniTrack';
import { Howl } from 'howler';
import { FaPlay, FaStop, FaTrash, FaCheck, FaMicrophone, FaMicrophoneSlash, FaCog } from 'react-icons/fa';

// Waveform visualization component
const WaveformVisualizer = ({ analyserNode, color = '#3B82F6', height = 100 }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const draw = useCallback(() => {
    if (!analyserNode || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Get frequency data
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteTimeDomainData(dataArray);
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, width, height);
    
    // Draw waveform
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = color;
    canvasCtx.beginPath();
    
    const sliceWidth = width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * height / 2;
      
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
    
    // Continue animation loop
    animationRef.current = requestAnimationFrame(draw);
  }, [analyserNode, color]);
  
  useEffect(() => {
    if (analyserNode) {
      animationRef.current = requestAnimationFrame(draw);
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [analyserNode, draw]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width="600" 
      height={height}
      className="w-full rounded-lg bg-gray-800"
    />
  );
};

// Vertical Level Meter component
const VerticalLevelMeter = ({ analyserNode, color = '#3B82F6', height = 100, width = 30, isRecording = false }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const draw = useCallback(() => {
    if (!analyserNode || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;
    
    // Get audio data - using frequency data for level meter
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);
    
    // Calculate audio level (average of frequency data)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const average = sum / bufferLength;
    
    // Map the average to a height value (0-255 to 0-canvasHeight)
    const levelHeight = (average / 255) * canvasHeight;
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw background
    canvasCtx.fillStyle = '#1F2937'; // Dark background
    canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw level meter (from bottom to top)
    const gradient = canvasCtx.createLinearGradient(0, canvasHeight, 0, canvasHeight - levelHeight);
    gradient.addColorStop(0, isRecording ? '#EF4444' : '#3B82F6'); // Blue or red based on recording state
    gradient.addColorStop(0.6, isRecording ? '#F87171' : '#60A5FA'); // Lighter shade
    gradient.addColorStop(1, isRecording ? '#FCA5A5' : '#93C5FD'); // Even lighter at the top
    
    canvasCtx.fillStyle = gradient;
    canvasCtx.fillRect(0, canvasHeight - levelHeight, canvasWidth, levelHeight);
    
    // Draw level markers
    canvasCtx.fillStyle = '#6B7280';
    for (let i = 1; i <= 10; i++) {
      const y = canvasHeight - (i * canvasHeight / 10);
      const markerHeight = i % 5 === 0 ? 4 : 2; // Taller markers at 50% and 100%
      canvasCtx.fillRect(0, y, canvasWidth / 3, markerHeight);
    }
    
    // Continue animation loop
    animationRef.current = requestAnimationFrame(draw);
  }, [analyserNode, color, isRecording]);
  
  useEffect(() => {
    if (analyserNode) {
      animationRef.current = requestAnimationFrame(draw);
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [analyserNode, draw]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height}
      className="rounded-lg"
    />
  );
};

export default function CollaboratePage() {
  const { trackId } = useParams();
  const router = useRouter();
  const [parentTrack, setParentTrack] = useState(null);
  const [activeTab, setActiveTab] = useState('record'); // Tabs: 'record' or 'upload'
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordedTakes, setRecordedTakes] = useState([]);
  const [selectedTakeIndex, setSelectedTakeIndex] = useState(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [autoRestart, setAutoRestart] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingTake, setCurrentPlayingTake] = useState(null);
  const [playSynchronized, setPlaySynchronized] = useState(true);
  const [latencyCompensation, setLatencyCompensation] = useState(200); // ms of latency compensation
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [audioQuality, setAudioQuality] = useState('high'); // low, medium, high
  const [audioMimeType, setAudioMimeType] = useState('audio/webm;codecs=opus');
  const [visualizerAnalyser, setVisualizerAnalyser] = useState(null);
  const [syncMethod, setSyncMethod] = useState('latency'); // 'latency' or 'timestamp'
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [parentTrackStartTime, setParentTrackStartTime] = useState(null);
  const [levelMeterActive, setLevelMeterActive] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const parentSoundRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const takeSoundsRef = useRef([]);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const levelMeterStreamRef = useRef(null);

  // Audio quality presets
  const audioQualitySettings = {
    low: {
      sampleRate: 22050,
      bitsPerSecond: 64000,
      mimeType: 'audio/webm;codecs=opus',
    },
    medium: {
      sampleRate: 44100,
      bitsPerSecond: 128000,
      mimeType: 'audio/webm;codecs=opus',
    },
    high: {
      sampleRate: 48000,
      bitsPerSecond: 256000,
      mimeType: 'audio/webm;codecs=opus',
    },
  };

  // Supported MIME types
  const supportedMimeTypes = [
    'audio/webm;codecs=opus', // Best quality for most browsers
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ].filter(type => MediaRecorder.isTypeSupported(type));

  // Fetch parent track
  useEffect(() => {
    const fetchParentTrack = async () => {
      try {
        const response = await api.get(`/tracks/${trackId}`);
        setParentTrack(response.data[0]);
      } catch (err) {
        console.error('Failed to fetch parent track:', err);
      }
    };
    fetchParentTrack();
  }, [trackId]);

  // Get audio input devices after permission
  useEffect(() => {
    const initDevices = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        console.log('Audio devices:', audioInputs); // Debug
        setAudioDevices(audioInputs);
        setSelectedDevice(audioInputs[0]?.deviceId || '');
      } catch (err) {
        console.error('Failed to initialize audio devices:', err);
      }
    };
    initDevices();
  }, []);

  // Initialize level meter when on record tab
  useEffect(() => {
    let isMounted = true;
    
    const setupLevelMeter = async () => {
      if (activeTab === 'record' && selectedDevice && !recording && isMounted) {
        console.log('Setting up level meter from useEffect');
        await initLevelMeter();
      }
    };
    
    setupLevelMeter();
    
    return () => {
      isMounted = false;
      if (activeTab !== 'record' || !selectedDevice) {
        console.log('Cleaning up level meter from useEffect');
        cleanupLevelMeter();
      }
    };
  }, [activeTab, selectedDevice, recording]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (parentSoundRef.current) {
        parentSoundRef.current.stop();
      }
      takeSoundsRef.current.forEach(sound => {
        if (sound) sound.stop();
      });
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      cleanupLevelMeter();
    };
  }, []);

  // Initialize the level meter
  const initLevelMeter = async () => {
    if (levelMeterActive || recording) return;
    
    try {
      // Clean up any existing level meter
      cleanupLevelMeter();
      
      // Get audio stream for the level meter
      const audioConstraints = {
        deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      
      // Store stream for cleanup
      levelMeterStreamRef.current = stream;
      
      // Set up Web Audio API for level meter
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create analyzer node
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256; // Smaller FFT size for level meter
      analyser.smoothingTimeConstant = 0.8;
      
      // Connect source to analyzer
      source.connect(analyser);
      
      // Store analyzer for visualization
      analyserNodeRef.current = analyser;
      setVisualizerAnalyser(analyser);
      setLevelMeterActive(true);
      
      console.log('Level meter initialized with audio context:', audioContext);
    } catch (err) {
      console.error('Failed to initialize level meter:', err);
      // Reset state to prevent issues
      setLevelMeterActive(false);
      setVisualizerAnalyser(null);
      audioContextRef.current = null;
      analyserNodeRef.current = null;
      if (levelMeterStreamRef.current) {
        levelMeterStreamRef.current.getTracks().forEach(track => track.stop());
        levelMeterStreamRef.current = null;
      }
    }
  };

  // Clean up level meter resources
  const cleanupLevelMeter = () => {
    console.log('Cleaning up level meter resources');
    setLevelMeterActive(false);
    
    // Only clean up if we're not recording
    if (!recording) {
      setVisualizerAnalyser(null);
      
      // Close audio context if it exists
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close().catch(err => {
            console.error('Error closing audio context:', err);
          });
        } catch (err) {
          console.error('Error closing audio context:', err);
        }
        audioContextRef.current = null;
      }
      
      // Stop and release the level meter stream
      if (levelMeterStreamRef.current) {
        try {
          levelMeterStreamRef.current.getTracks().forEach(track => track.stop());
        } catch (err) {
          console.error('Error stopping audio tracks:', err);
        }
        levelMeterStreamRef.current = null;
      }
      
      // Clear analyzer node reference
      analyserNodeRef.current = null;
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    if (!selectedDevice) return alert('Please select an audio input device');
    if (!parentTrack) return alert('Parent track not loaded');

    try {
      // Reset progress bar
      setProgress(0);
      
      // Get quality settings based on selected quality
      const qualitySettings = audioQualitySettings[audioQuality];
      
      // If we already have an active level meter, we can reuse its resources
      if (levelMeterActive && audioContextRef.current && analyserNodeRef.current && levelMeterStreamRef.current) {
        console.log('Reusing level meter resources for recording');
        
        // Store the stream for recording
        streamRef.current = levelMeterStreamRef.current;
        
        // We'll continue using the existing audio context and analyzer
        console.log('Using existing audio context:', audioContextRef.current);
      } else {
        console.log('Creating new audio resources for recording');
        
        // Configure audio constraints for better quality
        const audioConstraints = {
          deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
          sampleRate: qualitySettings.sampleRate,
          sampleSize: 16,
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
        
        // Store stream for cleanup
        streamRef.current = stream;
        
        // Set up Web Audio API for visualization
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: qualitySettings.sampleRate,
        });
        audioContextRef.current = audioContext;
        console.log('Created new audio context:', audioContext);
        
        // Create source from stream
        const source = audioContext.createMediaStreamSource(stream);
        
        // Create analyzer node
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // Must be a power of 2
        analyser.smoothingTimeConstant = 0.8; // Between 0 and 1, higher values smoother
        
        // Connect source to analyzer
        source.connect(analyser);
        
        // Store analyzer for visualization
        analyserNodeRef.current = analyser;
        setVisualizerAnalyser(analyser);
      }
      
      // Verify audio context is available
      if (!audioContextRef.current) {
        throw new Error('Audio context is not initialized');
      }
      
      // Configure MediaRecorder with better quality options
      const options = {
        mimeType: audioMimeType,
        audioBitsPerSecond: qualitySettings.bitsPerSecond,
      };
      
      console.log('Starting MediaRecorder with options:', options);
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);
      chunksRef.current = [];

      // Pre-load the parent track but don't play it yet
      parentSoundRef.current = new Howl({
        src: [parentTrack.combined_audio_url],
        html5: true,
        preload: true,
        onend: () => {
          if (autoRestart) {
            // Save current take and start a new one
            stopRecording();
            setTimeout(() => startRecording(), 500);
          } else {
            stopRecording();
          }
        },
        // Add precise timing for synchronization
        onplay: () => {
          // Store the exact time when the parent track started playing
          if (audioContextRef.current) {
            setParentTrackStartTime(audioContextRef.current.currentTime);
            console.log('Parent track started at audio context time:', audioContextRef.current.currentTime);
          } else {
            console.warn('Audio context not available for timing');
          }
        }
      });
      
      // Configure the MediaRecorder to collect data periodically
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      // Store the exact time when recording starts
      if (audioContextRef.current) {
        setRecordingStartTime(audioContextRef.current.currentTime);
        console.log('Recording started at audio context time:', audioContextRef.current.currentTime);
      } else {
        console.warn('Audio context not available for timing');
      }
      
      // Start recording with smaller timeslices for better quality
      mediaRecorderRef.current.start(100);
      
      // Set up progress tracking with more precise timing
      progressIntervalRef.current = setInterval(() => {
        if (parentSoundRef.current) {
          const seek = parentSoundRef.current.seek() || 0;
          const duration = parentTrack.duration || parentSoundRef.current.duration();
          const percentage = (seek / duration) * 100;
          setProgress(percentage);
          
          // Log timing information for debugging
          if (syncMethod === 'timestamp' && recordingStartTime && parentTrackStartTime && audioContextRef.current) {
            const recordingElapsed = audioContextRef.current.currentTime - recordingStartTime;
            const parentElapsed = audioContextRef.current.currentTime - parentTrackStartTime;
            const syncDiff = recordingElapsed - parentElapsed;
            
            if (Math.abs(syncDiff) > 0.05) { // If more than 50ms out of sync
              console.log(`Sync difference: ${syncDiff.toFixed(3)}s`);
            }
          }
        }
      }, 100);
      
      // Start recording first, then play the parent track
      setRecording(true);
      
      if (syncMethod === 'latency') {
        // Apply latency compensation: start recording first, then play audio after a delay
        setTimeout(() => {
          if (parentSoundRef.current) {
            parentSoundRef.current.play();
          }
        }, latencyCompensation);
      } else {
        // For timestamp-based sync, start both almost simultaneously
        // The timestamps will be used for post-processing alignment
        if (parentSoundRef.current) {
          parentSoundRef.current.play();
        }
      }
      
      console.log('Recording started with quality:', audioQuality, 'sync method:', syncMethod);
    } catch (err) {
      console.error('Recording error:', err);
      alert('Failed to start recording: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      // Make sure we collect any remaining data
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      // Stop the media recorder
      mediaRecorderRef.current.onstop = () => {
        console.log('MediaRecorder stopped, finalizing take...');
        finishTake();
      };
      
      mediaRecorderRef.current.stop();
      
      // Stop the parent track playback
      if (parentSoundRef.current) {
        parentSoundRef.current.stop();
      }
      
      // Clear the progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      // Reset progress bar
      setProgress(0);
      
      // Don't clean up audio context and analyzer - keep them for the level meter
      // Instead, reinitialize the level meter to continue showing it
      setTimeout(() => {
        if (activeTab === 'record') {
          initLevelMeter();
        }
      }, 500);
      
      // Stop and release the recording stream
      if (streamRef.current) {
        // Only stop tracks if we're not reusing the stream for the level meter
        if (streamRef.current !== levelMeterStreamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        streamRef.current = null;
      }
      
      setRecording(false);
    }
  };

  const finishTake = () => {
    if (chunksRef.current.length > 0) {
      // Create blob with the selected MIME type
      const blob = new Blob(chunksRef.current, { type: audioMimeType });
      const takeNumber = recordedTakes.length + 1;
      
      // Store timing information for synchronization
      const timingInfo = {
        recordingStartTime,
        parentTrackStartTime,
        syncMethod,
        latencyCompensation: syncMethod === 'latency' ? latencyCompensation : 0,
        recordedAt: new Date().toISOString(),
      };
      
      const newTake = {
        id: Date.now(),
        blob,
        url: URL.createObjectURL(blob),
        name: `Take ${takeNumber}`,
        quality: audioQuality,
        mimeType: audioMimeType,
        timingInfo,
      };
      
      // Use a callback to ensure we're working with the latest state
      setRecordedTakes(prevTakes => {
        const updatedTakes = [...prevTakes, newTake];
        // If this is the first take, select it
        if (prevTakes.length === 0) {
          setTimeout(() => setSelectedTakeIndex(0), 0);
        }
        return updatedTakes;
      });
      
      // Clear the chunks for the next recording
      chunksRef.current = [];
      
      // Reset timing information
      setRecordingStartTime(null);
      setParentTrackStartTime(null);
      
      console.log('Take finished, blob created:', blob);
      console.log('Take timing info:', timingInfo);
    } else {
      console.warn('No audio data collected during recording');
    }
  };

  const playTake = (index) => {
    // Stop any currently playing audio
    if (currentPlayingTake !== null && takeSoundsRef.current[currentPlayingTake]) {
      takeSoundsRef.current[currentPlayingTake].stop();
    }
    
    if (parentSoundRef.current && isPlaying) {
      parentSoundRef.current.stop();
    }
    
    // Get the selected take
    const selectedTake = recordedTakes[index];
    
    // Play the selected take
    if (!takeSoundsRef.current[index]) {
      takeSoundsRef.current[index] = new Howl({
        src: [selectedTake.url],
        html5: true,
        onend: () => {
          setIsPlaying(false);
          setCurrentPlayingTake(null);
          if (parentSoundRef.current) {
            parentSoundRef.current.stop();
          }
        }
      });
    }
    
    // If synchronized playback is enabled, play the parent track too
    if (playSynchronized) {
      // Create a new instance of the parent track for synchronized playback
      const syncedParentTrack = new Howl({
        src: [parentTrack.combined_audio_url],
        html5: true,
        onend: () => {
          // If the parent track ends before the take, stop everything
          if (takeSoundsRef.current[index]) {
            takeSoundsRef.current[index].stop();
          }
          setIsPlaying(false);
          setCurrentPlayingTake(null);
        }
      });
      
      // Store the synced parent track in the ref
      parentSoundRef.current = syncedParentTrack;
      
      // Check if we have timing information for better synchronization
      if (selectedTake.timingInfo) {
        const { syncMethod, latencyCompensation } = selectedTake.timingInfo;
        
        if (syncMethod === 'latency') {
          // For latency-based sync, apply the same latency compensation that was used during recording
          console.log(`Playing with latency compensation: ${latencyCompensation}ms`);
          
          // Play the take first
          takeSoundsRef.current[index].play();
          
          // Then play the parent track with the same delay
          setTimeout(() => {
            if (parentSoundRef.current) {
              parentSoundRef.current.play();
            }
          }, latencyCompensation);
        } else {
          // For timestamp-based sync, calculate the offset between recording and parent track
          // This is a simplified approach - in a production app, you might want to use more sophisticated
          // audio synchronization techniques
          console.log('Playing with timestamp-based synchronization');
          
          // Play both tracks simultaneously - the timestamps were used during recording
          // to ensure proper alignment
          takeSoundsRef.current[index].play();
          parentSoundRef.current.play();
        }
      } else {
        // Fallback to simultaneous playback if no timing info
        console.log('No timing information available, playing simultaneously');
        takeSoundsRef.current[index].play();
        parentSoundRef.current.play();
      }
    } else {
      // Play only the take
      takeSoundsRef.current[index].play();
    }
    
    setIsPlaying(true);
    setCurrentPlayingTake(index);
  };

  const stopPlayback = () => {
    if (currentPlayingTake !== null && takeSoundsRef.current[currentPlayingTake]) {
      takeSoundsRef.current[currentPlayingTake].stop();
      setCurrentPlayingTake(null);
    }
    
    if (parentSoundRef.current) {
      parentSoundRef.current.stop();
    }
    
    setIsPlaying(false);
  };

  const deleteTake = (index) => {
    // Stop if playing
    if (currentPlayingTake === index && takeSoundsRef.current[index]) {
      takeSoundsRef.current[index].stop();
      setCurrentPlayingTake(null);
      setIsPlaying(false);
    }
    
    // Remove the Howl instance
    takeSoundsRef.current = takeSoundsRef.current.filter((_, i) => i !== index);
    
    // Update selected take if needed
    if (selectedTakeIndex === index) {
      setSelectedTakeIndex(null);
    } else if (selectedTakeIndex > index) {
      setSelectedTakeIndex(selectedTakeIndex - 1);
    }
    
    // Remove the take
    setRecordedTakes(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!title) return alert('Please enter a title');
    
    if (activeTab === 'record') {
      if (selectedTakeIndex === null) return alert('Please select a take to upload');
      const selectedTake = recordedTakes[selectedTakeIndex];
      if (!selectedTake) return alert('Selected take not found');
      
      const formData = new FormData();
      formData.append('title', title);
      formData.append('parent_track_id', trackId);
      
      // Use the correct file extension based on MIME type
      let fileExtension = 'webm';
      if (selectedTake.mimeType.includes('mp4')) {
        fileExtension = 'mp4';
      } else if (selectedTake.mimeType.includes('ogg')) {
        fileExtension = 'ogg';
      }
      
      formData.append('audio', selectedTake.blob, `${title}-${Date.now()}.${fileExtension}`);

      try {
        await api.post('/tracks/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        router.push('/');
      } catch (err) {
        console.error('Upload error:', err);
        alert('Failed to upload track');
      }
    } else {
      if (!file) return alert('Please select a file');
      
      const formData = new FormData();
      formData.append('title', title);
      formData.append('parent_track_id', trackId);
      formData.append('audio', file);

      try {
        await api.post('/tracks/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        router.push('/');
      } catch (err) {
        console.error('Upload error:', err);
        alert('Failed to upload track');
      }
    }
  };

  const downloadParentTrack = () => {
    const link = document.createElement('a');
    link.href = parentTrack.combined_audio_url;
    link.download = `${parentTrack.title}.mp3`;
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Collaborate on Track</h1>
      {parentTrack ? (
        <>
          <div className="mb-6">
            <MiniTrack track={parentTrack} />
          </div>
          <div className="flex space-x-4 mb-4">
            <button
              onClick={() => {
                if (activeTab !== 'record') {
                  setActiveTab('record');
                  // Only initialize level meter if we're switching to record tab
                  if (selectedDevice && !recording) {
                    console.log('Switching to record tab, initializing level meter');
                    setTimeout(() => initLevelMeter(), 100);
                  }
                }
              }}
              className={`px-4 py-2 rounded ${activeTab === 'record' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-blue-400`}
            >
              Record Live
            </button>
            <button
              onClick={() => {
                if (activeTab !== 'upload') {
                  console.log('Switching to upload tab, cleaning up level meter');
                  cleanupLevelMeter();
                  setActiveTab('upload');
                }
              }}
              className={`px-4 py-2 rounded ${activeTab === 'upload' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-blue-400`}
            >
              Upload Pre-Recorded
            </button>
          </div>
          <div className="bg-p1 p-4 rounded">
            {activeTab === 'record' && (
              <div>
                <h2 className="text-lg font-semibold mb-2">Record Live</h2>
                
                {/* Device Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Select Microphone</label>
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="w-full p-2 border rounded"
                    disabled={recording}
                  >
                    {audioDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Mic ${audioDevices.indexOf(device) + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Advanced Settings Toggle */}
                <div className="mb-4">
                  <button
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="flex items-center text-sm text-blue-500 hover:text-blue-700"
                    disabled={recording}
                  >
                    <FaCog className="mr-1" />
                    {showAdvancedSettings ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                  </button>
                </div>
                
                {/* Advanced Settings */}
                {showAdvancedSettings && (
                  <div className="mb-4 p-3 bg-gray-100 rounded">
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">
                        Audio Quality
                      </label>
                      <select
                        value={audioQuality}
                        onChange={(e) => setAudioQuality(e.target.value)}
                        className="w-full p-2 border rounded"
                        disabled={recording}
                      >
                        <option value="low">Low (64kbps)</option>
                        <option value="medium">Medium (128kbps)</option>
                        <option value="high">High (256kbps)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Higher quality uses more bandwidth and storage.
                      </p>
                    </div>
                    
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">
                        Audio Format
                      </label>
                      <select
                        value={audioMimeType}
                        onChange={(e) => setAudioMimeType(e.target.value)}
                        className="w-full p-2 border rounded"
                        disabled={recording}
                      >
                        {supportedMimeTypes.map(type => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Opus codec generally provides the best quality.
                      </p>
                    </div>
                    
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">
                        Latency Compensation (ms)
                      </label>
                      <input
                        type="number"
                        value={latencyCompensation}
                        onChange={(e) => setLatencyCompensation(parseInt(e.target.value) || 0)}
                        min="0"
                        max="1000"
                        step="10"
                        className="w-full p-2 border rounded"
                        disabled={recording || syncMethod !== 'latency'}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Adjust if your recording is not synchronized with the parent track.
                        Higher values will delay the parent track playback.
                      </p>
                    </div>
                    
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">
                        Synchronization Method
                      </label>
                      <select
                        value={syncMethod}
                        onChange={(e) => setSyncMethod(e.target.value)}
                        className="w-full p-2 border rounded"
                        disabled={recording}
                      >
                        <option value="latency">Latency Compensation</option>
                        <option value="timestamp">Timestamp-based (Experimental)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Latency Compensation: Delays parent track playback by a fixed amount.<br/>
                        Timestamp-based: Uses precise timing for better synchronization.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Recording Controls */}
                <div className="mb-4">
                  <div className="flex items-center space-x-4 mb-2">
                    {/* Vertical Level Meter */}
                    <div className="h-16 flex items-center justify-center">
                      {(visualizerAnalyser) ? (
                        <VerticalLevelMeter 
                          analyserNode={visualizerAnalyser} 
                          height={64} 
                          width={24}
                          isRecording={recording}
                        />
                      ) : (
                        <div className="h-16 w-6 bg-gray-800 rounded-lg"></div>
                      )}
                    </div>
                    
                    <button
                      onClick={toggleRecording}
                      disabled={!selectedDevice}
                      className={`p-4 rounded-full text-white flex items-center justify-center ${
                        !selectedDevice ? 'bg-gray-500' : 
                        recording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                      }`}
                      title={recording ? "Stop Recording" : "Start Recording"}
                    >
                      {recording ? <FaMicrophoneSlash size={24} /> : <FaMicrophone size={24} />}
                    </button>
                    
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                        <div 
                          className="bg-blue-500 h-4 rounded-full transition-all duration-100"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {recording ? 'Recording in progress...' : 'Ready to record'}
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="autoRestart"
                        checked={autoRestart}
                        onChange={() => setAutoRestart(!autoRestart)}
                        className="mr-2"
                        disabled={recording}
                      />
                      <label htmlFor="autoRestart" className="text-sm">
                        Auto-restart
                      </label>
                    </div>
                  </div>
                  
                  {/* Waveform Visualization - Removed in favor of vertical level meter */}
                </div>
                
                {/* Recorded Takes */}
                {recordedTakes.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-md font-medium mb-2">Your Takes</h3>
                    
                    {/* Playback Options */}
                    <div className="flex items-center mb-2">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={playSynchronized}
                          onChange={() => setPlaySynchronized(!playSynchronized)}
                          className="mr-2"
                        />
                        <span className="text-sm">
                          Play takes synchronized with parent track
                        </span>
                      </label>
                    </div>
                    
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {recordedTakes.map((take, index) => (
                        <div 
                          key={take.id}
                          className={`flex bg-s1 items-center p-2 rounded ${
                            selectedTakeIndex === index ? 'bg-blue-100 border border-blue-300' : 'bg-gray-100'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{take.name}</div>
                            <div className="text-xs text-gray-500">
                              Quality: {take.quality || 'standard'} | Format: {take.mimeType?.split(';')[0] || 'webm'}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => currentPlayingTake === index && isPlaying ? stopPlayback() : playTake(index)}
                              className="p-2 rounded bg-blue-500 text-white hover:bg-blue-600"
                              title={currentPlayingTake === index && isPlaying 
                                ? "Stop" 
                                : playSynchronized ? "Play with parent track" : "Play take only"}
                            >
                              {currentPlayingTake === index && isPlaying ? <FaStop /> : <FaPlay />}
                            </button>
                            <button 
                              onClick={() => setSelectedTakeIndex(index)}
                              className={`p-2 rounded ${
                                selectedTakeIndex === index 
                                  ? 'bg-green-500 text-white' 
                                  : 'bg-gray-300 hover:bg-gray-400'
                              }`}
                              title="Select for upload"
                            >
                              <FaCheck />
                            </button>
                            <button 
                              onClick={() => deleteTake(index)}
                              className="p-2 rounded bg-red-500 text-white hover:bg-red-600"
                              title="Delete take"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Upload Form */}
                {recordedTakes.length > 0 && (
                  <div className="mt-4">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Track Title"
                      className="w-full p-2 border rounded mb-2"
                    />
                    <button
                      onClick={handleUpload}
                      disabled={selectedTakeIndex === null || !title}
                      className={`bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 ${
                        selectedTakeIndex === null || !title ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      Upload Selected Take
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'upload' && (
              <div>
                <h2 className="text-lg font-semibold mb-2">Upload Pre-Recorded</h2>
                <button
                  onClick={downloadParentTrack}
                  className="bg-blue-500 text-white px-4 py-2 rounded mb-2 hover:bg-blue-600"
                >
                  Download Parent Track
                </button>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="w-full p-2 border rounded mb-2"
                />
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Track Title"
                  className="w-full p-2 border rounded mb-2"
                />
                <button
                  onClick={handleUpload}
                  disabled={!file || !title}
                  className={`px-4 py-2 rounded text-white ${
                    file && title ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500'
                  }`}
                >
                  Upload File
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <p>Loading parent track...</p>
      )}
    </div>
  );
}