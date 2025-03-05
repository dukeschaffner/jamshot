'use client';

import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlay, faPause, faStepBackward, faStepForward, 
  faDrum, faMicrophone, faTrash, faUpload, faCloudUploadAlt,
  faHeart, faComment
} from '@fortawesome/free-solid-svg-icons';
import TracksWidget from './TracksWidget';

export default function CollabInterface({ track }) {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingLooperLeft, setIsDraggingLooperLeft] = useState(false);
  const [isDraggingLooperRight, setIsDraggingLooperRight] = useState(false);
  const [isDraggingLooperRegion, setIsDraggingLooperRegion] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [looperStartWidth, setLooperStartWidth] = useState(0);
  const [looperStartLeft, setLooperStartLeft] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showRecordingSection, setShowRecordingSection] = useState(false);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [takes, setTakes] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  
  // Positions (in percentage)
  const [looperLeftPos, setLooperLeftPos] = useState(0);
  const [looperRightPos, setLooperRightPos] = useState(100);
  const [playheadPos, setPlayheadPos] = useState(0);
  
  // Refs
  const waveformContainerRef = useRef(null);
  const playheadRef = useRef(null);
  const looperRef = useRef(null);
  const looperHandleLeftRef = useRef(null);
  const looperHandleRightRef = useRef(null);
  const looperRegionRef = useRef(null);
  const playheadAnimationRef = useRef(null);
  const audioRef = useRef(null);
  
  // Track duration in seconds (default to 90 seconds if not available)
  const trackDuration = track?.duration || 90;
  
  // Helper functions
  const posToTime = (pos, duration) => {
    return (pos / 100) * duration;
  };
  
  const timeToPos = (time, duration) => {
    return (time / duration) * 100;
  };
  
  // Get available input devices
  const [inputDevices, setInputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  
  // Refs
  const recordingStream = useRef(null);
  
  // State for take playback
  const [playingTakeId, setPlayingTakeId] = useState(null);
  const takesAudioRef = useRef({});
  
  // Log track data only once
  useEffect(() => {
    console.log('CollabInterface received track:', track);
  }, []);
  
  // Initialize audio element
  useEffect(() => {
    console.log('Track data in useEffect:', track);
    console.log('Audio URL:', track?.combined_audio_url);
    
    if (track?.combined_audio_url) {
      console.log('Creating new Audio element');
      const audio = new Audio();
      audio.src = track.combined_audio_url;
      audio.preload = 'auto';
      
      // Log when audio is loaded
      audio.addEventListener('loadeddata', () => {
        console.log('Audio loaded successfully');
        console.log('Audio duration:', audio.duration);
      });
      
      // Log any errors
      audio.addEventListener('error', (e) => {
        console.error('Audio loading error:', e);
      });
      
      audioRef.current = audio;
      
      // Set up audio event listeners
      audio.addEventListener('timeupdate', () => {
        const currentTime = audio.currentTime;
        const duration = audio.duration || trackDuration;
        const percent = (currentTime / duration) * 100;
        
        // Only update playhead position if not dragging
        if (!isDragging()) {
          setPlayheadPos(percent);
        }
        
        // Check if we need to loop
        if (isLooping && percent >= looperRightPos) {
          console.log('Reached loop end, resetting to loop start');
          const loopStartTime = posToTime(looperLeftPos, duration);
          audio.currentTime = loopStartTime;
        }
      });
      
      audio.addEventListener('ended', () => {
        console.log('Audio playback ended');
        if (isLooping) {
          // If looping, jump back to loop start
          const loopStartTime = posToTime(looperLeftPos, audio.duration);
          audio.currentTime = loopStartTime;
          audio.play().catch(err => console.error('Error restarting loop:', err));
        } else {
          setIsPlaying(false);
        }
      });
      
      // Try to load the audio
      audio.load();
    }
    
    return () => {
      if (audioRef.current) {
        console.log('Cleaning up audio element');
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, [track, isLooping, looperLeftPos, looperRightPos]);
  
  // Check if audio URL is valid
  useEffect(() => {
    const checkAudioUrl = async () => {
      if (track?.combined_audio_url) {
        try {
          console.log('Checking audio URL:', track.combined_audio_url);
          const response = await fetch(track.combined_audio_url, { method: 'HEAD' });
          if (response.ok) {
            console.log('Audio URL is valid and accessible');
          } else {
            console.error('Audio URL returned status:', response.status);
          }
        } catch (error) {
          console.error('Error checking audio URL:', error);
        }
      }
    };
    
    checkAudioUrl();
  }, [track?.combined_audio_url]);
  
  // Helper function to safely play audio
  const safePlayAudio = async () => {
    if (!audioRef.current) {
      console.error('No audio element available');
      return false;
    }
    
    try {
      await audioRef.current.play();
      console.log('Audio playing successfully');
      return true;
    } catch (error) {
      console.error('Error playing audio:', error);
      return false;
    }
  };
  
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
  
  // Toggle play/pause
  const togglePlay = async () => {
    console.log('Toggle play clicked, isPlaying:', isPlaying);
    console.log('Audio element:', audioRef.current);
    console.log('Track audio URL:', track?.combined_audio_url);
    
    if (!audioRef.current && track?.combined_audio_url) {
      console.log('Audio element not initialized, creating new one');
      const audio = new Audio();
      audio.src = track.combined_audio_url;
      audio.preload = 'auto';
      
      // Set up basic event listeners
      audio.addEventListener('timeupdate', () => {
        const currentTime = audio.currentTime;
        const duration = audio.duration || trackDuration;
        const percent = (currentTime / duration) * 100;
        
        if (!isDragging()) {
          setPlayheadPos(percent);
        }
        
        // Check if we need to loop
        if (isLooping && percent >= looperRightPos) {
          console.log('Reached loop end, resetting to loop start');
          const loopStartTime = posToTime(looperLeftPos, duration);
          audio.currentTime = loopStartTime;
        }
      });
      
      audioRef.current = audio;
    }
    
    if (audioRef.current) {
      if (isPlaying) {
        console.log('Pausing audio');
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        console.log('Attempting to play audio');
        
        // Check if playhead is outside loop region when looping is enabled
        if (isLooping) {
          const currentPos = playheadPos;
          if (currentPos < looperLeftPos || currentPos > looperRightPos) {
            console.log('Playhead outside loop region, moving to loop start');
            const loopStartTime = posToTime(looperLeftPos, audioRef.current.duration);
            audioRef.current.currentTime = loopStartTime;
            setPlayheadPos(looperLeftPos);
          }
        }
        
        // Force load if not loaded
        if (audioRef.current.readyState === 0) {
          console.log('Audio not loaded, forcing load');
          audioRef.current.load();
        }
        
        const success = await safePlayAudio();
        if (success) {
          setIsPlaying(true);
        }
      }
    } else {
      console.error('No audio element available and could not create one');
    }
  };
  
  // Toggle metronome
  const toggleMetronome = () => {
    setIsMetronomeOn(prev => !prev);
  };
  
  // Toggle recording
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      
      // Stop the track playback
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      
      setIsRecording(false);
    } else {
      // Start recording
      if (!selectedInputDevice) {
        alert('Please select an input device first');
        return;
      }
      
      try {
        // Stop any existing stream
        if (recordingStream.current) {
          recordingStream.current.getTracks().forEach(track => track.stop());
        }
        
        // Create new stream with selected device
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: selectedInputDevice }
          }
        });
        
        recordingStream.current = stream;
        
        // Create media recorder
        const recorder = new MediaRecorder(stream);
        setMediaRecorder(recorder);
        
        // Clear previous chunks
        setRecordedChunks([]);
        
        // Set up event handlers
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            setRecordedChunks(prev => [...prev, e.data]);
          }
        };
        
        recorder.onstop = () => {
          // Create blob from chunks
          const blob = new Blob(recordedChunks, { type: 'audio/webm' });
          
          // Create object URL
          const url = URL.createObjectURL(blob);
          
          // Add new take
          const newTake = {
            id: Date.now(),
            url,
            blob,
            name: `Take ${takes.length + 1}`,
            duration: audioRef.current ? audioRef.current.duration : trackDuration
          };
          
          setTakes(prev => [...prev, newTake]);
        };
        
        // Start recording
        recorder.start();
        setIsRecording(true);
        
        // Play the track from the beginning of the loop region or the beginning of the track
        if (audioRef.current) {
          // If looping is enabled, start from the loop start position
          if (isLooping) {
            audioRef.current.currentTime = posToTime(looperLeftPos, audioRef.current.duration);
          } else {
            // Otherwise start from the beginning
            audioRef.current.currentTime = 0;
          }
          
          // Play the track
          await safePlayAudio();
          setIsPlaying(true);
        }
      } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording: ' + error.message);
      }
    }
  };
  
  // Handle input device selection
  const handleInputDeviceChange = (e) => {
    setSelectedInputDevice(e.target.value);
  };
  
  // Show the collaboration modal
  const showCollabModal = () => {
    setShowModal(true);
  };
  
  // Handle record option selection
  const handleRecordOption = () => {
    setShowModal(false);
    setShowRecordingSection(true);
    setShowUploadSection(false);
  };
  
  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check if file is an audio file
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file');
      return;
    }
    
    setSelectedFile(file);
    setFileName(file.name);
    
    // Create object URL for the file
    const url = URL.createObjectURL(file);
    
    // Add as a new take
    const newTake = {
      id: Date.now(),
      url,
      blob: file,
      name: file.name
    };
    
    setTakes(prev => [...prev, newTake]);
  };
  
  // Handle upload option
  const handleUploadOption = () => {
    setShowModal(false);
    // Trigger file input click
    document.getElementById('file-upload').click();
  };
  
  // Handle drag and drop
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
  
  const handleDrop = (e) => {
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
    
    setSelectedFile(file);
    setFileName(file.name);
    
    // Create object URL for the file
    const url = URL.createObjectURL(file);
    
    // Add as a new take
    const newTake = {
      id: Date.now(),
      url,
      blob: file,
      name: file.name
    };
    
    setTakes(prev => [...prev, newTake]);
  };
  
  // Handle waveform click
  const handleWaveformClick = (e) => {
    if (!waveformContainerRef.current || !audioRef.current) return;
    
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const clickPos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    
    // Update playhead position
    setPlayheadPos(clickPos);
    
    // Update audio position
    const newTime = posToTime(clickPos, audioRef.current.duration);
    audioRef.current.currentTime = newTime;
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
  
  // Effects
  
  // Update visuals when state changes
  useEffect(() => {
    updateVisuals();
  }, [
    playheadPos, looperLeftPos, looperRightPos, isLooping,
    isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion
  ]);
  
  // Get available input devices
  useEffect(() => {
    const getInputDevices = async () => {
      try {
        // Request permission to access media devices
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Get list of available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
        
        console.log('Available audio input devices:', audioInputDevices);
        setInputDevices(audioInputDevices);
        
        // Set default device
        if (audioInputDevices.length > 0) {
          setSelectedInputDevice(audioInputDevices[0].deviceId);
        }
        
        // Stop the temporary stream
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('Error getting input devices:', error);
      }
    };
    
    getInputDevices();
  }, []);
  
  // Set up audio analyzer for input level visualization
  useEffect(() => {
    if (!selectedInputDevice) return;
    
    const setupAudioAnalyzer = async () => {
      try {
        // Stop any existing stream
        if (recordingStream.current) {
          recordingStream.current.getTracks().forEach(track => track.stop());
        }
        
        // Create new stream with selected device
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: selectedInputDevice }
          }
        });
        
        recordingStream.current = stream;
      } catch (error) {
        console.error('Error setting up audio analyzer:', error);
      }
    };
    
    setupAudioAnalyzer();
  }, [selectedInputDevice]);
  
  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingLooperLeft && !isDraggingLooperRight && !isDraggingPlayhead && !isDraggingLooperRegion) return;
      
      if (waveformContainerRef.current) {
        const rect = waveformContainerRef.current.getBoundingClientRect();
        const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        // Dragging playhead
        if (isDraggingPlayhead && audioRef.current) {
          setPlayheadPos(mousePos);
          const newTime = posToTime(mousePos, audioRef.current.duration);
          audioRef.current.currentTime = newTime;
          
          // Show time tooltip
          showTimeTooltip(playheadRef.current, mousePos, formatDuration(newTime));
        }
        
        // Dragging left looper handle
        if (isDraggingLooperLeft) {
          const newLeftPos = Math.max(0, Math.min(looperRightPos - 5, mousePos));
          setLooperLeftPos(newLeftPos);
          
          // If playhead is to the left of the new left position and audio is playing,
          // move the playhead to the new left position
          if (playheadPos < newLeftPos && isPlaying && audioRef.current) {
            setPlayheadPos(newLeftPos);
            audioRef.current.currentTime = posToTime(newLeftPos, audioRef.current.duration);
          }
          
          // Show time tooltip
          if (audioRef.current) {
            const time = posToTime(newLeftPos, audioRef.current.duration);
            showTimeTooltip(looperHandleLeftRef.current, newLeftPos, formatDuration(time));
          }
        }
        
        // Dragging right looper handle
        if (isDraggingLooperRight) {
          const newRightPos = Math.max(looperLeftPos + 5, Math.min(100, mousePos));
          setLooperRightPos(newRightPos);
          
          // Show time tooltip
          if (audioRef.current) {
            const time = posToTime(newRightPos, audioRef.current.duration);
            showTimeTooltip(looperHandleRightRef.current, newRightPos, formatDuration(time));
          }
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
          if (isPlaying && audioRef.current && isLooping) {
            if (playheadPos < newLeftPos || playheadPos > newRightPos) {
              setPlayheadPos(newLeftPos);
              audioRef.current.currentTime = posToTime(newLeftPos, audioRef.current.duration);
            }
          }
          
          // Show tooltip with start and end times
          if (audioRef.current) {
            const looperStartTime = posToTime(newLeftPos, audioRef.current.duration);
            const looperEndTime = posToTime(newRightPos, audioRef.current.duration);
            showTimeTooltip(
              looperRegionRef.current, 
              (newLeftPos + newRightPos) / 2, 
              `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
            );
          }
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
    looperLeftPos, looperRightPos, dragStartX, looperStartLeft, looperStartWidth
  ]);
  
  // Play/pause a take
  const toggleTakePlayback = (takeId) => {
    // If this take is already playing, pause it
    if (playingTakeId === takeId) {
      if (takesAudioRef.current[takeId]) {
        takesAudioRef.current[takeId].pause();
        setPlayingTakeId(null);
      }
      return;
    }
    
    // If another take is playing, pause it first
    if (playingTakeId && takesAudioRef.current[playingTakeId]) {
      takesAudioRef.current[playingTakeId].pause();
    }
    
    // Find the take
    const take = takes.find(t => t.id === takeId);
    if (!take) return;
    
    // Create or get audio element for this take
    if (!takesAudioRef.current[takeId]) {
      const audio = new Audio(take.url);
      
      // Set up ended event
      audio.addEventListener('ended', () => {
        setPlayingTakeId(null);
      });
      
      takesAudioRef.current[takeId] = audio;
    }
    
    // Play the take
    takesAudioRef.current[takeId].currentTime = 0;
    takesAudioRef.current[takeId].play()
      .then(() => {
        setPlayingTakeId(takeId);
      })
      .catch(error => {
        console.error('Error playing take:', error);
      });
  };
  
  // Delete a take
  const deleteTake = (takeId) => {
    // Stop playback if this take is playing
    if (playingTakeId === takeId && takesAudioRef.current[takeId]) {
      takesAudioRef.current[takeId].pause();
      setPlayingTakeId(null);
    }
    
    // Remove the take from the list
    setTakes(prev => prev.filter(take => take.id !== takeId));
    
    // Clean up the audio element
    if (takesAudioRef.current[takeId]) {
      takesAudioRef.current[takeId].pause();
      takesAudioRef.current[takeId].src = '';
      takesAudioRef.current[takeId] = null;
    }
  };
  
  // Clean up take audio elements when takes change
  useEffect(() => {
    // Clean up any removed takes
    Object.keys(takesAudioRef.current).forEach(id => {
      if (!takes.some(take => take.id === parseInt(id))) {
        if (takesAudioRef.current[id]) {
          takesAudioRef.current[id].pause();
          takesAudioRef.current[id] = null;
        }
      }
    });
    
    return () => {
      // Clean up all take audio elements on unmount
      Object.values(takesAudioRef.current).forEach(audio => {
        if (audio) {
          audio.pause();
          audio.src = '';
        }
      });
    };
  }, [takes]);
  
  // Helper function to check if any dragging is happening
  const isDragging = () => {
    // This is now handled in TracksWidget
    return false;
  };
  
  return (
    <div className="collab-container">
      {/* Track Header */}
      <div className="track-header">
        <div className="track-info">
          <h1 className="track-title">{track?.title || 'Untitled Track'}</h1>
          <div className="track-artist">
            <div className="artist-avatar">
              <img src={track?.profile_pic_url || '/placeholder-avatar.png'} alt="Artist Avatar" />
            </div>
            <span className="artist-name">{track?.username || 'Unknown Artist'}</span>
            {track?.verified && <span className="verified-badge">✓</span>}
          </div>
          <div className="track-meta">
            <span className="meta-item"><FontAwesomeIcon icon={faPlay} /> {track?.play_count || 0}</span>
            <span className="meta-item"><FontAwesomeIcon icon={faHeart} /> {track?.like_count || 0}</span>
            <span className="meta-item"><FontAwesomeIcon icon={faComment} /> {track?.collab_count || 0} collabs</span>
          </div>
        </div>
        <div className="track-controls">
          <button className="control-button play-pause" onClick={togglePlay}>
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
          </button>
          <button className="control-button">
            <FontAwesomeIcon icon={faStepBackward} />
          </button>
          <button className="control-button">
            <FontAwesomeIcon icon={faStepForward} />
          </button>
          <div className="bpm-control">
            <span>{track?.metronome_bpm || 120} BPM</span>
            <button 
              className={`metronome-toggle ${isMetronomeOn ? 'active' : ''}`}
              onClick={toggleMetronome}
            >
              <FontAwesomeIcon icon={faDrum} />
            </button>
          </div>
        </div>
      </div>

      {/* Tracks Widget */}
      <TracksWidget 
        track={track}
        isPlaying={isPlaying}
        isLooping={isLooping}
        playheadPos={playheadPos}
        looperLeftPos={looperLeftPos}
        looperRightPos={looperRightPos}
        trackDuration={trackDuration}
        setPlayheadPos={setPlayheadPos}
        setLooperLeftPos={setLooperLeftPos}
        setLooperRightPos={setLooperRightPos}
        setIsLooping={setIsLooping}
        audioRef={audioRef}
        showCollabModal={showCollabModal}
        posToTime={posToTime}
        timeToPos={timeToPos}
      />

      {/* Recording Section */}
      {showRecordingSection && (
        <div className="recording-section">
          <div className="input-device-selector">
            <label htmlFor="input-device" className="input-device-label">Select Input Device</label>
            <select id="input-device" className="input-device-select" onChange={handleInputDeviceChange}>
              <option value="">Select Input Device</option>
              {inputDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || device.deviceId}</option>
              ))}
            </select>
          </div>
          <div className="record-buttons">
            <button 
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              <FontAwesomeIcon icon={isRecording ? faPlay : faMicrophone} />
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>
          <div className="takes-container">
            <h3>Your Takes</h3>
            {takes.length === 0 ? (
              <div className="empty-takes">
                <p>No takes yet. Record or upload your collaboration.</p>
              </div>
            ) : (
              <div className="takes-list">
                {takes.map((take) => (
                  <div key={take.id} className="take-item">
                    <div className="take-info">
                      <span className="take-name">{take.name}</span>
                      <div className="take-controls">
                        <button 
                          className={`take-play-btn ${playingTakeId === take.id ? 'playing' : ''}`}
                          onClick={() => toggleTakePlayback(take.id)}
                        >
                          <FontAwesomeIcon icon={playingTakeId === take.id ? faPause : faPlay} />
                        </button>
                        <button 
                          className="take-delete-btn"
                          onClick={() => deleteTake(take.id)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </div>
                    <div className="take-waveform">
                      {/* Placeholder for waveform visualization */}
                      <div className="take-waveform-placeholder"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Section */}
      {showUploadSection && (
        <div className="upload-section">
          <div 
            className="file-upload-area"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <FontAwesomeIcon icon={faCloudUploadAlt} className="upload-icon" />
            <div className="file-upload-text">
              Drag and drop your audio file here or
              <button 
                className="browse-btn"
                onClick={() => document.getElementById('file-upload').click()}
              >
                Browse
              </button>
            </div>
            <input 
              type="file" 
              id="file-upload" 
              className="file-upload-input" 
              accept="audio/*"
              onChange={handleFileChange}
            />
            {fileName && (
              <div className="file-name">
                Selected file: {fileName}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal for Collaboration Options */}
      {showModal && (
        <div className="modal-overlay active" onClick={(e) => {
          if (e.target.className === 'modal-overlay active') {
            setShowModal(false);
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">How would you like to collaborate?</h2>
              <p className="modal-subtitle">Choose an option to continue</p>
            </div>
            <div className="modal-options">
              <div className="option-card" onClick={handleRecordOption}>
                <FontAwesomeIcon icon={faMicrophone} className="option-icon" />
                <h3 className="option-title">Record Live</h3>
                <p className="option-description">Record your collaboration in real-time</p>
              </div>
              <div className="option-card" onClick={handleUploadOption}>
                <FontAwesomeIcon icon={faUpload} className="option-icon" />
                <h3 className="option-title">Upload File</h3>
                <p className="option-description">Upload a pre-recorded audio file</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 