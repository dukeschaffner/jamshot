'use client';

import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlay, faPause, faStepBackward, faStepForward, 
  faDrum, faMicrophone, faTrash, faUpload, faCloudUploadAlt,
  faHeart, faComment, faCircle, faStop, faCog
} from '@fortawesome/free-solid-svg-icons';
import TracksWidget from './TracksWidget';
import RecordingWidget from './RecordingWidget';
import UploadForm from './UploadForm';
import CountInIcon from './CountInIcon';
import Cookies from 'js-cookie';
import './DawInterface.css';
import { useNavigationGuard } from 'next-navigation-guard';

export default function DawInterface({ track, isCollab = false }) {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [isCountInEnabled, setIsCountInEnabled] = useState(true);
  const [metronomeBpm, setMetronomeBpm] = useState(track?.metronome_bpm || 120);
  const [metronomeVolume, setMetronomeVolume] = useState(0.7);
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
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [bpmInputValue, setBpmInputValue] = useState(metronomeBpm.toString());
  const [timeSignature, setTimeSignature] = useState(track?.time_signature || '4/4');
  const [metronomeOffset, setMetronomeOffset] = useState(track?.metronome_offset || 0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [isEditingTimeSignature, setIsEditingTimeSignature] = useState(false);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const bpmControlRef = useRef(null);

  // Add navigation guard hook to prevent accidental navigation when recording exists
  useNavigationGuard({ 
    enabled: !!recordingPlaybackBuffer && !uploadComplete, 
    confirm: () => window.confirm("You have unsaved recordings. Are you sure you want to leave? Your recordings will be lost.") 
  });

  // Track duration in seconds (default to 90 seconds if not available)
  const trackDuration = track?.duration || 90;

  // Time signature options
  const timeSignatureOptions = [
    '4/4', '3/4', '2/4', '2/2', '6/8', '9/8', '12/8', '5/4', '7/8', '3/8'
  ];
  
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

  // Update BPM when track changes
  useEffect(() => {
    const initialBpm = track?.metronome_bpm || 120;
    setMetronomeBpm(initialBpm);
    setBpmInputValue(initialBpm.toString());
    
    const initialTimeSignature = track?.time_signature || '4/4';
    setTimeSignature(initialTimeSignature);
  }, [track]);
  
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

    // Load snap to grid preference from cookies
    const savedSnapToGridEnabled = Cookies.get('snapToGridEnabled');
    if (savedSnapToGridEnabled !== undefined) {
      setSnapToGridEnabled(savedSnapToGridEnabled === 'true');
    }

    return deviceSelected;
  }

  // Save latency compensation to cookies when it changes
  useEffect(() => {
    Cookies.set('userLatencyCompensation', userLatencyCompensation.toString(), { expires: 365 });
  }, [userLatencyCompensation]);
  
  // Save snap to grid preference to cookies when it changes
  useEffect(() => {
    Cookies.set('snapToGridEnabled', snapToGridEnabled.toString(), { expires: 365 });
  }, [snapToGridEnabled]);
  
  // Toggle play/pause
  const togglePlay = async () => {
    setIsPlaying(!isPlaying);
  };
  
  // Toggle metronome
  const toggleMetronome = () => {
    setIsMetronomeOn(prev => !prev);
  };

  useEffect(() => {
    if(isMetronomeOn){
      setIsCountInEnabled(true);
    }
    else{
      setIsCountInEnabled(false);
    }
  }, [isMetronomeOn]);
  
  // Toggle count-in
  const toggleCountIn = () => {
    setIsCountInEnabled(prev => !prev);
  };
  
  // Handle BPM input change
  const handleBpmChange = (e) => {
    // Only allow numbers
    const value = e.target.value.replace(/[^0-9]/g, '');
    setBpmInputValue(value);
  };

  // Handle BPM input key press events for numeric validation and submit/cancel
  const handleBpmKeyDown = (e) => {
    // Handle submit/cancel
    if (e.key === 'Enter') {
      setIsEditingBpm(false);
      updateBpmValue();
      return;
    } else if (e.key === 'Escape') {
      setIsEditingBpm(false);
      setBpmInputValue(metronomeBpm.toString());
      return;
    }
    
    // Allow: backspace, delete, tab, escape, enter
    if ([8, 46, 9, 27, 13].indexOf(e.keyCode) !== -1 ||
        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode >= 65 && e.keyCode <= 90 && e.ctrlKey === true) ||
        // Allow: home, end, left, right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
      // Let it happen
      return;
    }
    
    // Ensure that it is a number and stop the keypress if it's not
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && 
        (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  };

  // Handle BPM input blur
  const handleBpmBlur = () => {
    // Validate and update BPM when input loses focus
    setIsEditingBpm(false);
    updateBpmValue();
  };

  // Update BPM value with validation
  const updateBpmValue = () => {
    // Convert to number and validate range
    let newBpm = parseInt(bpmInputValue, 10);
    
    // If not a valid number, revert to current BPM
    if (isNaN(newBpm)) {
      setBpmInputValue(metronomeBpm.toString());
      return;
    }
    
    // Clamp to reasonable BPM range (40-240)
    newBpm = Math.max(40, Math.min(240, newBpm));
    
    // Only update if the BPM actually changed
    if (newBpm !== metronomeBpm) {
      // Update BPM state and input value
      setMetronomeBpm(newBpm);
      setBpmInputValue(newBpm.toString());
    }
  };
  
  // Start editing BPM
  const startEditingBpm = () => {
    setBpmInputValue(metronomeBpm.toString());
    setIsEditingBpm(true);
  };

  // Start editing time signature
  const startEditingTimeSignature = () => {
    setIsEditingTimeSignature(true);
  };

  // Handle time signature change
  const handleTimeSignatureChange = (newTimeSignature) => {
    // Only update if the time signature changed
    if (newTimeSignature !== timeSignature) {
      setTimeSignature(newTimeSignature);
      
      // This is client-side only and doesn't save the value to the track
      console.log(`Time signature changed to ${newTimeSignature}`);
    }
    
    // Close the dropdown
    setIsEditingTimeSignature(false);
  };

  const handleTimeSignatureBlur = () => {
    setIsEditingTimeSignature(false);
    updateTimeSignatureValue();
  };


  // handle click outside bpm control to finish editing bpm or time signature
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (bpmControlRef.current && !bpmControlRef.current.contains(event.target)) {
        if(isEditingBpm){
          handleBpmBlur();
        }
        else if(isEditingTimeSignature){
          setIsEditingTimeSignature(false);
        }
      }
    };

    if (isEditingBpm || isEditingTimeSignature) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditingBpm, isEditingTimeSignature]);
  

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

  // Handle toggle for snap to grid
  const handleSnapToGridChange = (e) => {
    setSnapToGridEnabled(e.target.checked);
  };

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
            {(isRecording || !isPlaying) && (
              <button 
                className="control-button record-stop"
                onClick={toggleRecording}
              >
                <FontAwesomeIcon icon={isRecording ? faStop : faCircle}/>
              </button>
            )}
          
          {/* <button className="control-button">
            <FontAwesomeIcon icon={faStepBackward} />
          </button>
          <button className="control-button">
            <FontAwesomeIcon icon={faStepForward} />
          </button> */}
          <div className="bpm-control" ref={bpmControlRef}>
            {isEditingBpm ? (
              <input
                type="text"
                value={bpmInputValue}
                onChange={handleBpmChange}
                onKeyDown={handleBpmKeyDown}
                onBlur={handleBpmBlur}
                className="bpm-input"
                maxLength="3"
                autoFocus
                aria-label="Set BPM"
              />
            ) : (
              <span 
                onClick={startEditingBpm}
                title="Click to edit BPM"
                style={{ cursor: 'pointer' }}
              >
                {metronomeBpm} BPM
              </span>
            )}
            {isEditingTimeSignature && (
              <div className="time-signature-dropdown">
                {timeSignatureOptions.map((option) => (
                  <div 
                    key={option} 
                    className={`time-signature-option ${timeSignature === option ? 'active' : ''}`}
                    onClick={() => handleTimeSignatureChange(option)}
                    onBlur={handleTimeSignatureBlur}
                  >
                    {option}
                  </div>
                ))}
              </div>
            )}
            <span 
              onClick={startEditingTimeSignature}
              title="Click to edit Time Signature"
              style={{ cursor: 'pointer' }}
            >
              {timeSignature}
            </span>
            <button 
              className={`metronome-toggle ${isMetronomeOn ? 'active' : ''}`}
              onClick={toggleMetronome}
              title="Toggle Metronome"
            >
              <FontAwesomeIcon icon={faDrum} />
            </button>
            {isMetronomeOn && (
              <button 
                className={`count-in-toggle ${isCountInEnabled ? 'active' : ''}`}
                onClick={toggleCountIn}
                title="Toggle Count-in before recording"
              >
                <CountInIcon isEnabled={isCountInEnabled} />
              </button>
            )}
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
              Go To: Upload
            </button>
          )}
      </div>

      {/* Tracks Widget */}
      {isCollab ? (
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
          isMetronomeOn={isMetronomeOn}
          bpm={metronomeBpm}
          metronomeVolume={metronomeVolume}
          setMetronomeVolume={setMetronomeVolume}
          timeSignature={timeSignature}
          isCountInEnabled={isCountInEnabled}
          metronomeOffset={metronomeOffset}
          setMetronomeOffset={setMetronomeOffset}
          snapToGridEnabled={snapToGridEnabled}
        />
      ) : (
        <RecordingWidget 
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          isRecording={isRecording}
          setIsRecording={setIsRecording}
          recordingPlaybackBuffer={recordingPlaybackBuffer}
          setRecordingPlaybackBuffer={setRecordingPlaybackBuffer}
          selectedAudioInputDevice={selectedAudioInputDevice}
          userLatencyCompensation={userLatencyCompensation}
          setRecordingGain={setRecordingGain}
          isMetronomeOn={isMetronomeOn}
          bpm={metronomeBpm}
          metronomeVolume={metronomeVolume}
          timeSignature={timeSignature}
          isCountInEnabled={isCountInEnabled}
          metronomeOffset={metronomeOffset}
          setMetronomeOffset={setMetronomeOffset}
          snapToGridEnabled={snapToGridEnabled}
        />
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

              {/* Metronome Volume Control */}
              <div className="form-group mt-4">
                <label htmlFor="metronome-volume">
                  Metronome Volume: {Math.round(metronomeVolume * 100)}%
                </label>
                <div className="slider-container">
                  <input
                    type="range"
                    id="metronome-volume"
                    className="form-range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={metronomeVolume}
                    onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Adjust the volume of the metronome click sound.
                </p>
              </div>

              {/* Snap to Grid Toggle */}
              <div className="form-group mt-4">
                <div className="toggle-container">
                  <label htmlFor="snap-to-grid" className="toggle-label">
                    Snap to Grid
                    <input
                      type="checkbox"
                      id="snap-to-grid"
                      checked={snapToGridEnabled}
                      onChange={handleSnapToGridChange}
                      className="toggle-input ml-2"
                    />
                    <span className="toggle-switch"></span>
                  </label>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  When enabled, looper will snap to grid lines for more precise looping.
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
          onCancel={() => {
            setShowUploadForm(false);
          }}
          originalGain={originalGain}
          recordingGain={recordingGain}
          metronomeBpm={metronomeBpm}
          setMetronomeBpm={setMetronomeBpm}
          timeSignature={timeSignature}
          setTimeSignature={(newTimeSignature) => {
            // Update the time signature in this component
            setTimeSignature(newTimeSignature);
          }}
          metronomeOffset={metronomeOffset}
          onUploadComplete={() => {
            console.log("Upload completed successfully!");
            setUploadComplete(true);
          }}
        />
      )}
    </>



  );
} 