'use client';

import { useState, useEffect } from 'react';
import styles from './AudioSettings.module.css';
import Cookies from 'js-cookie';
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';

export default function AudioSettings({ 
  showAudioSettingsModal,
  setShowAudioSettingsModal
}) {
  // Internal state for all audio settings
  const [selectedAudioInputDevice, setSelectedAudioInputDevice] = useState('');
  const [userLatencyCompensation, setUserLatencyCompensation] = useState(15);
  const [metronomeVolume, setMetronomeVolume] = useState(0.7);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const [audioInputDevices, setAudioInputDevices] = useState([]);


  // Get available audio input devices
  const getAudioInputDevices = async () => {
    try {
      if (showAudioSettingsModal) {
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
    else{ // Get the first audio input device
      setSelectedAudioInputDevice(audioInputs[0].deviceId);
      deviceSelected = true;
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

  useEffect(() => {
    Cookies.set('preferredAudioInputDevice', selectedAudioInputDevice, { expires: 365 });
  }, [selectedAudioInputDevice]);

   // Save latency compensation to cookies when it changes
   useEffect(() => {
    Cookies.set('userLatencyCompensation', userLatencyCompensation.toString(), { expires: 365 });
  }, [userLatencyCompensation]);
  
  // Save snap to grid preference to cookies when it changes
  useEffect(() => {
    Cookies.set('snapToGridEnabled', snapToGridEnabled.toString(), { expires: 365 });
  }, [snapToGridEnabled]);

  // Handle audio input device selection
  const handleAudioInputDeviceChange = (e) => {
    setSelectedAudioInputDevice(e.target.value);
    eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, { deviceId: e.target.value });
  };

  // Handle latency compensation change
  const handleLatencyCompensationChange = (e) => {
    const latencyCompensation = parseInt(e.target.value, 10);
    setUserLatencyCompensation(latencyCompensation);
    eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.LATENCY_COMPENSATION_CHANGE, { latencyCompensation: latencyCompensation });
  };

  // Handle snap to grid toggle
  const handleSnapToGridChange = (e) => {
    const snapToGridEnabled = e.target.checked;
    setSnapToGridEnabled(snapToGridEnabled);
    eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.SNAP_TO_GRID_CHANGE, { snapToGridEnabled: snapToGridEnabled });
  };

  // Handle metronome volume change
  const handleMetronomeVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setMetronomeVolume(newVolume);
    eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.METRONOME_VOLUME_CHANGE, { volume: newVolume });
  };

  // Handle close button click
  const handleClose = () => {
    setShowAudioSettingsModal(false);
  };

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target.className === styles.modalOverlay) {
      setShowAudioSettingsModal(false);
    }
  };


  if (!showAudioSettingsModal) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleBackdropClick}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Audio Settings</h2>
          <p className={styles.modalSubtitle}>Configure your recording settings</p>
        </div>
        
        <div className={styles.modalBody}>
          {/* Audio Input Device Selection */}
          <div className={styles.formGroup}>
            <label htmlFor="audio-input-device">Audio Input Device</label>
            <select 
              id="audio-input-device" 
              className={styles.formControl}
              value={selectedAudioInputDevice}
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
          
          {/* Latency Compensation */}
          <div className={styles.formGroup}>
            <label htmlFor="latency-compensation">
              Latency Compensation: {userLatencyCompensation} ms
            </label>
            <div className={styles.sliderContainer}>
              <input
                type="range"
                id="latency-compensation"
                className={styles.formRange}
                min="0"
                max="100"
                step="1"
                value={userLatencyCompensation}
                onChange={handleLatencyCompensationChange}
              />
            </div>
            <p className={styles.helpText}>
              Adjust this value if your recording is not in sync with the original track.
            </p>
          </div>

          {/* Metronome Volume Control */}
          <div className={styles.formGroup}>
            <label htmlFor="metronome-volume">
              Metronome Volume: {Math.round(metronomeVolume * 100)}%
            </label>
            <div className={styles.sliderContainer}>
              <input
                type="range"
                id="metronome-volume"
                className={styles.formRange}
                min="0"
                max="1"
                step="0.05"
                value={metronomeVolume}
                onChange={handleMetronomeVolumeChange}
              />
            </div>
            <p className={styles.helpText}>
              Adjust the volume of the metronome click sound.
            </p>
          </div>

          {/* Snap to Grid Toggle */}
          <div className={styles.formGroup}>
            <div className={styles.toggleContainer}>
              <label htmlFor="snap-to-grid" className={styles.toggleLabel}>
                Snap to Grid
                <input
                  type="checkbox"
                  id="snap-to-grid"
                  checked={snapToGridEnabled}
                  onChange={handleSnapToGridChange}
                  className={styles.toggleInput}
                />
                <span className={styles.toggleSwitch}></span>
              </label>
            </div>
            <p className={styles.helpText}>
              When enabled, looper will snap to grid lines for more precise looping.
            </p>
          </div>
        </div>
        
        <div className={styles.modalFooter}>
          <button 
            className={styles.btnSecondary}
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 