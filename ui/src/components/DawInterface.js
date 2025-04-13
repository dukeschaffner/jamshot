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
import './DawInterface.css';
export default function DawInterface({ track, isCollab = false }) {
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
  const [originalGain, setOriginalGain] = useState(0.8);
  const [recordingGain, setRecordingGain] = useState(0.8);

  // Track duration in seconds (default to 90 seconds if not available)
  const trackDuration = track?.duration || 90;
  
  // Fetch original audio when track changes and in collab mode
  useEffect(() => {
    const fetchOriginalAudio = async () => {
      // Only fetch original audio in collab mode and if track has combined_audio_url
      if (!isCollab || !track?.combined_audio_url) return;
      
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
  }, [track, isCollab]);
  
  const getAudioInputDevices = async () => {
    try {
      if(showAudioSettingsModal){
        await navigator.mediaDevices.getUserMedia({ audio: true }); 
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioInputDevices(audioInputs);
      return audioInputs;
    } catch (error) {
      console.error('Error getting audio input devices:', error);
    }
  };

  // Fetch available audio input devices
  useEffect(() => {
    configureAudioSettings();
  }, [showAudioSettingsModal]);

  const configureAudioSettings = async () => {
    const audioInputs = await getAudioInputDevices();
    const preferredAudioInputDevice = Cookies.get('preferredAudioInputDevice');
    let deviceSelected = false;
    if(audioInputs.length === 1){
      setSelectedAudioInputDevice(audioInputs[0].deviceId);
      deviceSelected = true;
    }
    else if(preferredAudioInputDevice){
      const device = audioInputs.find(device => device.deviceId === preferredAudioInputDevice);
      if(device){
        setSelectedAudioInputDevice(device.deviceId);
        deviceSelected = true;
      }
    }
    else{
      setShowAudioSettingsModal(true);
    }

    const savedLatencyCompensation = Cookies.get('userLatencyCompensation');
    if (savedLatencyCompensation !== undefined) {
      setUserLatencyCompensation(parseInt(savedLatencyCompensation, 10));
    } else {
      // Default value of 15ms if not set
      setUserLatencyCompensation(15);
    }

    return deviceSelected;
  }
  
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
  
  
  // Handle audio input device selection
  const handleAudioInputDeviceChange = (e) => {
    setSelectedAudioInputDevice(e.target.value);
    Cookies.set('preferredAudioInputDevice', e.target.value, { expires: 365 });
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
  const toggleRecording = async () => {
    // If not recording and no device selected, show audio settings modal
    let deviceSelected = false;
    if (!isRecording && !selectedAudioInputDevice) {
      deviceSelected = await configureAudioSettings();
      if(!deviceSelected){
        return;
      }
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
  
  // Determine if there's any audio content available
  const hasAudioContent = isCollab ? 
    (originalAudioChunks !== null || recordingPlaybackBuffer !== null) : 
    recordingPlaybackBuffer !== null;
  
  return (
    <>
    <div 
      className="collab-container" 
      style={{display: showUploadForm ? 'none' : 'block'}}
    >
      {/* Track Header */}
      <div className="daw-interface">
        {/* Track info can be conditionally shown based on isCollab if needed */}
        <div className="daw-controls">
            {!isRecording && hasAudioContent && (
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
          
          {/* <button className="control-button">
            <FontAwesomeIcon icon={faStepBackward} />
          </button>
          <button className="control-button">
            <FontAwesomeIcon icon={faStepForward} />
          </button> */}
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
        {recordingPlaybackBuffer && !isRecording && (isCollab ? track?.layer < 4 : true) && (
            <button 
              className="upload-btn"
              onClick={handleUploadRecording}
              title="Upload Recording"
            >
              <FontAwesomeIcon icon={faUpload} />
              Next: Upload
            </button>
          )}
      </div>

      {/* Tracks Widget */}

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
        setIsRecording={setIsRecording}
        selectedAudioInputDevice={selectedAudioInputDevice}
        userLatencyCompensation={userLatencyCompensation}
        isCollab={isCollab}
        setOriginalGain={setOriginalGain}
        setRecordingGain={setRecordingGain}
      />

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

    {/* Upload Form */}
    {recordingPlaybackBuffer && showUploadForm && (
        <UploadForm 
          isCollab={isCollab}
          recordingAudioBuffer={recordingPlaybackBuffer}
          parentTrack={isCollab ? track : null}
          onCancel={() => setShowUploadForm(false)}
          originalGain={originalGain}
          recordingGain={recordingGain}
        />
      )}
    </>



  );
} 