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
  const [showModal, setShowModal] = useState(false);
  const [showRecordingSection, setShowRecordingSection] = useState(false);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [takes, setTakes] = useState([]);
  const [fileName, setFileName] = useState('');
  const [originalAudioChunks, setOriginalAudioChunks] = useState(null);
  const [recordingAudioChunks, setRecordingAudioChunks] = useState(null);
  
  // Positions (in percentage)
  const [looperLeftPos, setLooperLeftPos] = useState(0);
  const [looperRightPos, setLooperRightPos] = useState(100);
  const [playheadPos, setPlayheadPos] = useState(0);
  
  // Refs
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
  
  // Refs
  const recordingStream = useRef(null);
  
  // State for take playback
  const [playingTakeId, setPlayingTakeId] = useState(null);
  const takesAudioRef = useRef({});
  
  // Log track data only once
  useEffect(() => {
    console.log('CollabInterface received track:', track);
  }, []);
  
  // Fetch original audio when track changes
  useEffect(() => {
    const fetchOriginalAudio = async () => {
      if (!track?.combined_audio_url) return;
      
      try {
        const response = await fetch(track.combined_audio_url);
        const blob = await response.blob();
        
        // Convert blob to array buffer
        const arrayBuffer = await blob.arrayBuffer();
        
        // Create audio chunks
        const chunks = [new Uint8Array(arrayBuffer)];
        setOriginalAudioChunks(chunks);
      } catch (error) {
        console.error('Error fetching original audio:', error);
      }
    };
    
    fetchOriginalAudio();
  }, [track]);
  
  // Toggle play/pause
  const togglePlay = async () => {
    setIsPlaying(!isPlaying);
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
      
      setIsPlaying(false);
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
            setRecordedChunks(prev => {
              const newChunks = [...prev, e.data];
              setRecordingAudioChunks(newChunks);
              return newChunks;
            });
          }
        };
        
        // Start recording
        recorder.start(100); // Collect data every 100ms for real-time visualization
        setIsRecording(true);
        
        // Start playback
        setIsPlaying(true);
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
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check if file is an audio file
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file');
      return;
    }
    
    setSelectedFile(file);
    setFileName(file.name);
    
    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Create chunks
      const chunks = [new Uint8Array(arrayBuffer)];
      setRecordingAudioChunks(chunks);
      
      // Add as a new take
      const newTake = {
        id: Date.now(),
        chunks,
        name: file.name
      };
      
      setTakes(prev => [...prev, newTake]);
    } catch (error) {
      console.error('Error processing uploaded file:', error);
    }
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
    
    setSelectedFile(file);
    setFileName(file.name);
    
    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Create chunks
      const chunks = [new Uint8Array(arrayBuffer)];
      setRecordingAudioChunks(chunks);
      
      // Add as a new take
      const newTake = {
        id: Date.now(),
        chunks,
        name: file.name
      };
      
      setTakes(prev => [...prev, newTake]);
    } catch (error) {
      console.error('Error processing dropped file:', error);
    }
  };
  
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
  
  // Play/pause a take
  const toggleTakePlayback = (takeId) => {
    // If this take is already playing, pause it
    if (playingTakeId === takeId) {
      setPlayingTakeId(null);
      return;
    }
    
    // Find the take
    const take = takes.find(t => t.id === takeId);
    if (!take) return;
    
    // Set the recording audio chunks to this take's chunks
    setRecordingAudioChunks(take.chunks);
    
    // Start playback
    setIsPlaying(true);
    setPlayingTakeId(takeId);
  };
  
  // Delete a take
  const deleteTake = (takeId) => {
    // Stop playback if this take is playing
    if (playingTakeId === takeId) {
      setIsPlaying(false);
      setPlayingTakeId(null);
    }
    
    // Remove the take from the list
    setTakes(prev => prev.filter(take => take.id !== takeId));
    
    // Clear recording audio chunks if this was the active take
    if (playingTakeId === takeId) {
      setRecordingAudioChunks(null);
    }
  };
  
  // Clean up take audio elements when takes change
  useEffect(() => {
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
        originalAudioChunks={originalAudioChunks}
        recordingAudioChunks={recordingAudioChunks}
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