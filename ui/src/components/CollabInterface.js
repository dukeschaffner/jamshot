'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDuration, posToTime, timeToPos } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlay, faPause, faStepBackward, faStepForward, 
  faDrum, faMicrophone, faTrash, faUpload, faCloudUploadAlt,
  faHeart, faComment
} from '@fortawesome/free-solid-svg-icons';

export default function CollabInterface({ track }) {
  console.log('CollabInterface received track:', track);

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
  const [inputLevel, setInputLevel] = useState(20);
  const [audioElement, setAudioElement] = useState(null);
  
  // Positions (in percentage)
  const [looperLeftPos, setLooperLeftPos] = useState(20);
  const [looperRightPos, setLooperRightPos] = useState(40);
  const [playheadPos, setPlayheadPos] = useState(30);
  
  // Refs
  const waveformContainerRef = useRef(null);
  const playheadRef = useRef(null);
  const looperRef = useRef(null);
  const looperHandleLeftRef = useRef(null);
  const looperHandleRightRef = useRef(null);
  const looperRegionRef = useRef(null);
  const playheadAnimationRef = useRef(null);
  const inputMeterAnimationRef = useRef(null);
  const audioRef = useRef(null);
  
  // Track duration in seconds (default to 90 seconds if not available)
  const trackDuration = track?.duration || 90;
  
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
      
      setAudioElement(audio);
      audioRef.current = audio;
      
      // Set up audio event listeners
      audio.addEventListener('timeupdate', () => {
        const percent = (audio.currentTime / audio.duration) * 100;
        if (!isDraggingPlayhead) {
          setPlayheadPos(percent);
        }
        
        // Check if we need to loop
        if (isLooping && percent >= looperRightPos) {
          audio.currentTime = posToTime(looperLeftPos, audio.duration);
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
  }, [track]);
  
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
        const percent = (audio.currentTime / audio.duration) * 100;
        if (!isDraggingPlayhead) {
          setPlayheadPos(percent);
        }
      });
      
      setAudioElement(audio);
      audioRef.current = audio;
    }
    
    if (audioRef.current) {
      if (isPlaying) {
        console.log('Pausing audio');
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        console.log('Attempting to play audio');
        // If playhead is outside loop region and looping is enabled, move to loop start
        if (isLooping && (playheadPos < looperLeftPos || playheadPos > looperRightPos)) {
          console.log('Adjusting to loop start position');
          audioRef.current.currentTime = posToTime(looperLeftPos, audioRef.current.duration);
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
  const toggleRecording = () => {
    setIsRecording(prev => !prev);
  };
  
  // Add a new take
  const addNewTake = () => {
    const takeNumber = takes.length + 1;
    setTakes(prev => [...prev, { id: takeNumber, name: `Take ${takeNumber}` }]);
  };
  
  // Delete a take
  const deleteTake = (takeId) => {
    setTakes(prev => prev.filter(take => take.id !== takeId));
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
  
  // Handle upload option selection
  const handleUploadOption = () => {
    setShowModal(false);
    setShowUploadSection(true);
    setShowRecordingSection(false);
  };
  
  // Handle file selection
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };
  
  // Effects
  
  // Update visuals when state changes
  useEffect(() => {
    updateVisuals();
  }, [
    playheadPos, looperLeftPos, looperRightPos, isLooping,
    isDraggingLooperLeft, isDraggingLooperRight, isDraggingPlayhead, isDraggingLooperRegion
  ]);
  
  // Handle recording
  useEffect(() => {
    if (isRecording) {
      // Simulate input level changes
      inputMeterAnimationRef.current = setInterval(() => {
        setInputLevel(Math.random() * 80 + 10); // Random between 10% and 90%
      }, 100);
    } else {
      clearInterval(inputMeterAnimationRef.current);
      setInputLevel(20);
    }
    
    return () => clearInterval(inputMeterAnimationRef.current);
  }, [isRecording]);
  
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
          audioRef.current.currentTime = posToTime(mousePos, audioRef.current.duration);
        }
        
        // Dragging left looper handle
        if (isDraggingLooperLeft) {
          setLooperLeftPos(Math.max(0, Math.min(looperRightPos - 5, mousePos)));
        }
        
        // Dragging right looper handle
        if (isDraggingLooperRight) {
          setLooperRightPos(Math.max(looperLeftPos + 5, Math.min(100, mousePos)));
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

      {/* DAW Interface */}
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
          <div className="waveform-container" ref={waveformContainerRef}>
            <div className="waveform">
              {/* SVG Waveform */}
              <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
                <path 
                  d="M0,50 Q10,40 20,50 T40,50 T60,50 T80,30 T100,50 T120,60 T140,50 T160,40 T180,50 T200,70 T220,50 T240,30 T260,50 T280,60 T300,50 T320,40 T340,50 T360,60 T380,50 T400,30 T420,50 T440,70 T460,50 T480,30 T500,50 T520,60 T540,50 T560,40 T580,50 T600,70 T620,50 T640,30 T660,50 T680,60 T700,50 T720,40 T740,50 T760,60 T780,50 T800,30 T820,50 T840,70 T860,50 T880,30 T900,50 T920,60 T940,50 T960,40 T980,50 T1000,50" 
                  fill="none" 
                  stroke="var(--seafoam)" 
                  strokeWidth="2"
                />
              </svg>
              {/* Playhead */}
              <div 
                className="playhead" 
                ref={playheadRef}
                style={{ left: `${playheadPos}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDraggingPlayhead(true);
                  showTimeTooltip(playheadRef.current, playheadPos);
                }}
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
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDraggingLooperLeft(true);
                  showTimeTooltip(looperHandleLeftRef.current, looperLeftPos);
                }}
              ></div>
              <div 
                className="looper-region" 
                ref={looperRegionRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLooping(prev => !prev);
                }}
                onMouseDown={(e) => {
                  if (e.target === looperRegionRef.current) {
                    e.stopPropagation();
                    setIsDraggingLooperRegion(true);
                    setDragStartX(e.clientX);
                    setLooperStartLeft(looperLeftPos);
                    setLooperStartWidth(looperRightPos - looperLeftPos);
                    
                    // Show tooltip with start and end times
                    const looperStartTime = posToTime(looperLeftPos, trackDuration);
                    const looperEndTime = posToTime(looperRightPos, trackDuration);
                    showTimeTooltip(
                      looperRegionRef.current, 
                      (looperLeftPos + looperRightPos) / 2, 
                      `${formatDuration(looperStartTime)} - ${formatDuration(looperEndTime)}`
                    );
                  }
                }}
              ></div>
              <div 
                className="looper-handle right" 
                ref={looperHandleRightRef}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDraggingLooperRight(true);
                  showTimeTooltip(looperHandleRightRef.current, looperRightPos);
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Your Recording */}
        <div className="track-container your-track">
          <div className="track-label">
            <span>Your Recording</span>
          </div>
          <div 
            className="waveform-container empty"
            onClick={showCollabModal}
          >
            <div className="empty-message">
              <FontAwesomeIcon icon={faMicrophone} />
              <span>Record your collaboration</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recording Section */}
      {showRecordingSection && (
        <div className="recording-section">
          <div className="input-device-selector">
            <label htmlFor="input-device" className="input-device-label">Select Input Device</label>
            <select id="input-device" className="input-device-select">
              <option value="default">Default Microphone</option>
              <option value="mic1">Microphone 1</option>
              <option value="mic2">Microphone 2</option>
              <option value="line-in">Line In</option>
            </select>
          </div>
          <div className="input-meter-container">
            <div className="input-label">Input Level</div>
            <div className="input-meter">
              <div className="meter-level" style={{ width: `${inputLevel}%` }}></div>
            </div>
          </div>
          <div className="record-buttons">
            <button 
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={() => {
                toggleRecording();
                if (isRecording) {
                  // If stopping recording, add a new take
                  addNewTake();
                }
              }}
            >
              <FontAwesomeIcon icon={isRecording ? faPlay : faMicrophone} />
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>
          <div className="takes-container">
            <h3>Your Takes</h3>
            <div className="takes-list">
              {takes.map(take => (
                <div className="take-item" key={take.id}>
                  <span className="take-name">{take.name}</span>
                  <div className="take-controls">
                    <button className="take-play">
                      <FontAwesomeIcon icon={faPlay} />
                    </button>
                    <button 
                      className="take-delete"
                      onClick={() => deleteTake(take.id)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                    <button className="take-use">Use This Take</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      {showUploadSection && (
        <div className="upload-section">
          <label htmlFor="audio-file" className="file-upload-container">
            <FontAwesomeIcon icon={faCloudUploadAlt} className="file-upload-icon" />
            <div className="file-upload-text">
              <p>Drag and drop your audio file here</p>
              <p>or click to browse</p>
            </div>
            <input 
              type="file" 
              id="audio-file" 
              className="file-upload-input" 
              accept="audio/*"
              onChange={handleFileChange}
            />
          </label>
          {selectedFile && (
            <div className="file-name">{selectedFile.name}</div>
          )}
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