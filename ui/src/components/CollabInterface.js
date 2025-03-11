'use client';

import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlay, faPause, faStepBackward, faStepForward, 
  faDrum, faMicrophone, faTrash, faUpload, faCloudUploadAlt,
  faHeart, faComment, faCircle, faStop, faCog
} from '@fortawesome/free-solid-svg-icons';
import TracksWidget from './TracksWidget';
import UploadForm from './UploadForm';
import Cookies from 'js-cookie';
import './CollabInterface.css';

export default function CollabInterface({ track }) {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [originalAudioChunks, setOriginalAudioChunks] = useState(null);
  const [recordingPlaybackBuffer, setRecordingPlaybackBuffer] = useState(null);
  const [fileChunks, setFileChunks] = useState(null);
  const [showAudioSettingsModal, setShowAudioSettingsModal] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [selectedAudioInputDevice, setSelectedAudioInputDevice] = useState(null);
  const [userLatencyCompensation, setUserLatencyCompensation] = useState(0);
  
  // Track duration in seconds (default to 90 seconds if not available)
  const trackDuration = track?.duration || 90;
  
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
  
  // Fetch available audio input devices
  useEffect(() => {
    const getAudioInputDevices = async () => {
      try {
        if(showAudioSettingsModal){
          await navigator.mediaDevices.getUserMedia({ audio: true }); 
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioInputDevices(audioInputs);
      } catch (error) {
        console.error('Error getting audio input devices:', error);
      }
    };
    
    getAudioInputDevices();
    
    // Load latency compensation from cookies
    const savedLatencyCompensation = Cookies.get('userLatencyCompensation');
    if (savedLatencyCompensation !== undefined) {
      setUserLatencyCompensation(parseInt(savedLatencyCompensation, 10));
    } else {
      // Default value of 20ms if not set
      setUserLatencyCompensation(20);
    }
  }, [showAudioSettingsModal]);
  
  // Save latency compensation to cookies when it changes
  useEffect(() => {
    Cookies.set('userLatencyCompensation', userLatencyCompensation.toString(), { expires: 365 });
  }, [userLatencyCompensation]);
  
  // Toggle play/pause
  const togglePlay = async () => {
    setIsPlaying(!isPlaying);
  };
  
  // Toggle metronome
  const toggleMetronome = () => {
    setIsMetronomeOn(prev => !prev);
  };
  
  const showCollabModal = () => {
    setShowModal(true);
  };
  
  // Handle record option selection
  const handleRecordOption = () => {
    setShowModal(false);
    setShowRecordingSection(true);
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
      setFileChunks(chunks);
      
    } catch (error) {
      console.error('Error processing uploaded file:', error);
    }
  };
  
  // Handle upload option
  const handleUploadOption = () => {
    setShowModal(false);
    setShowUploadForm(true);
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
      setFileChunks(chunks);
      
    } catch (error) {
      console.error('Error processing dropped file:', error);
    }
  };
  
  // Handle audio input device selection
  const handleAudioInputDeviceChange = (e) => {
    setSelectedAudioInputDevice(e.target.value);
  };
  
  // Handle latency compensation change
  const handleLatencyCompensationChange = (e) => {
    setUserLatencyCompensation(parseInt(e.target.value, 10));
  };
  
  // Start recording after device selection
  const startRecordingAfterDeviceSelection = () => {
    setShowAudioSettingsModal(false);
    toggleRecording();
  };
  
  // Toggle recording state
  const toggleRecording = () => {
    // If not recording and no device selected, show audio settings modal
    if (!isRecording && !selectedAudioInputDevice) {
      setShowAudioSettingsModal(true);
      return;
    }
    
    // Toggle recording state
    setIsRecording(!isRecording);
  };

  // Handle upload recording
  const handleUploadRecording = () => {
    if (recordingPlaybackBuffer) {
      setShowUploadForm(true);
    }
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
            {!isRecording && (
                <button 
                className="control-button play-pause" 
                onClick={togglePlay}
                disabled={isRecording}
              >
                <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
              </button>
            )}
          <button 
            className="control-button record-stop"
            onClick={toggleRecording}
          >
            <FontAwesomeIcon icon={isRecording ? faStop : faCircle}/>
          </button>
          {recordingPlaybackBuffer && !isRecording && (
            <button 
              className="control-button upload"
              onClick={handleUploadRecording}
              title="Upload Recording"
            >
              <FontAwesomeIcon icon={faUpload} />
            </button>
          )}
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
          <button 
            className="control-button settings"
            onClick={() => setShowAudioSettingsModal(true)}
            title="Audio Settings"
          >
            <FontAwesomeIcon icon={faCog} />
          </button>
        </div>
      </div>

      {/* Tracks Widget */}
      {!showUploadForm && (
        <TracksWidget 
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          trackDuration={trackDuration}
          showCollabModal={showCollabModal}
          originalAudioChunks={originalAudioChunks}
          fileChunks={fileChunks}
          recordingPlaybackBuffer={recordingPlaybackBuffer}
          setRecordingPlaybackBuffer={setRecordingPlaybackBuffer}
          isRecording={isRecording}
          selectedAudioInputDevice={selectedAudioInputDevice}
          userLatencyCompensation={userLatencyCompensation}
        />
      )}

      {/* Upload Form */}
      {recordingPlaybackBuffer && showUploadForm && (
        <UploadForm 
          isCollab={true}
          recordingAudioBuffer={recordingPlaybackBuffer}
          parentTrack={track}
          onCancel={() => setShowUploadForm(false)}
        />
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

      {/* Audio Settings Modal */}
      {showAudioSettingsModal && (
        <div className="modal-overlay active" onClick={(e) => {
          if (e.target.className === 'modal-overlay active') {
            setShowAudioSettingsModal(false);
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Audio Settings</h2>
              <p className="modal-subtitle">Configure your recording settings</p>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="audio-input-device">Audio Input Device</label>
                <select 
                  id="audio-input-device" 
                  className="form-control"
                  value={selectedAudioInputDevice || ''}
                  onChange={handleAudioInputDeviceChange}
                >
                  <option value="">Select an audio input device</option>
                  {audioInputDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group mt-4">
                <label htmlFor="latency-compensation">
                  Latency Compensation: {userLatencyCompensation} ms
                </label>
                <div className="slider-container">
                  <input
                    type="range"
                    id="latency-compensation"
                    className="form-range"
                    min="0"
                    max="100"
                    step="1"
                    value={userLatencyCompensation}
                    onChange={handleLatencyCompensationChange}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Adjust this value if your recording is not in sync with the original track.
                  Negative values play your recording earlier, positive values play it later.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowAudioSettingsModal(false)}
              >
                Close
              </button>
              {!isRecording && (
                <button 
                  className="btn btn-primary"
                  onClick={startRecordingAfterDeviceSelection}
                  disabled={!selectedAudioInputDevice}
                >
                  Start Recording
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 