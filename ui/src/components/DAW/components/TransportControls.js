import React, { useRef, useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlay, 
  faPause, 
  faStop, 
  faCircle, 
  faDrum, 
  faCog,
  faUndo,
  faRedo
} from '@fortawesome/free-solid-svg-icons';
import CountInIcon from '../misc/CountInIcon';
import AudioSettings from './AudioSettings';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import styles from '../DAW.module.css';
import { useUser } from '../../../contexts/UserContext';
import DAWConfig from '../misc/DAWConfig';
import { useDAW } from '../DAWContext';

const timeSignatureOptions = DAWConfig.timeSignature.options;

const TransportControls = ({
  isRecording,
  isPlaying,
  metronomeBpm,
  timeSignature,
}) => {

  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [isCountInEnabled, setIsCountInEnabled] = useState(true);
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [isEditingTimeSignature, setIsEditingTimeSignature] = useState(false);
  const [bpmInputValue, setBpmInputValue] = useState(metronomeBpm.toString());
  const [showAudioSettingsModal, setShowAudioSettingsModal] = useState(false);
  const bpmControlRef = useRef(null);

  const { isCollab, recordingTrackHasAudio, canUndo, canRedo, undo, redo} = useDAW();

  const { isAuthenticated } = useUser();
  const isAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const togglePlayPause = () => {
    if (isPlaying) {
      // Emit pause event
      eventBus.emit(DAW_EVENTS.TRANSPORT.PAUSE);
    } else {
      // Emit play event
      console.log('playing called');
      eventBus.emit(DAW_EVENTS.TRANSPORT.PLAY);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      eventBus.emit(DAW_EVENTS.RECORDING.STOP);
    } else {
      // Start recording
      if(isAuthenticatedRef.current) {
        eventBus.emit(DAW_EVENTS.RECORDING.START);
      }
      else {
        alert('Please sign in to record');
      }
    }
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
      eventBus.emit(DAW_EVENTS.METRONOME.BPM_CHANGE, { bpm: newBpm });
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
      eventBus.emit(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, { timeSignature: newTimeSignature });
      
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

  // Toggle count-in
  const toggleCountIn = () => {
    const newState = !isCountInEnabled;
    setIsCountInEnabled(newState);
    eventBus.emit(DAW_EVENTS.METRONOME.COUNT_IN_TOGGLE, { isOn: newState });
  };

  // Toggle metronome
  const toggleMetronome = () => {
    const newState = !isMetronomeOn;
    setIsMetronomeOn(newState);
    eventBus.emit(DAW_EVENTS.METRONOME.TOGGLE, { isOn: newState });
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


  return (
    <>
    <div className={styles.transportControls}>
        {!isRecording && (isCollab || recordingTrackHasAudio) && (
            <button 
            className={styles.controlButton + ' ' + styles.playPause} 
            onClick={togglePlayPause}
        >
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
        </button>
        )}
        {(isRecording || !isPlaying) && (
        <button 
            className={styles.controlButton + ' ' + styles.recordStop}
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
    <div className={styles.bpmControl} ref={bpmControlRef}>
        {isEditingBpm ? (
        <input
            type="text"
            value={bpmInputValue}
            onChange={handleBpmChange}
            onKeyDown={handleBpmKeyDown}
            onBlur={handleBpmBlur}
            className={styles.bpmInput}
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
        <div className={styles.timeSignatureDropdown}>
            {timeSignatureOptions.map((option) => (
            <div 
                key={option} 
                className={`${styles.timeSignatureOption} ${timeSignature === option ? styles.active : ''}`}
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
        className={`${styles.metronomeToggle} ${isMetronomeOn ? styles.active : ''}`}
        onClick={toggleMetronome}
        title="Toggle Metronome"
        >
        <FontAwesomeIcon icon={faDrum} />
        </button>
        {isMetronomeOn && (
        <button 
            className={`${styles.countInToggle} ${isCountInEnabled ? styles.active : ''}`}
            onClick={toggleCountIn}
            title="Toggle Count-in before recording"
        >
            <CountInIcon isEnabled={isCountInEnabled} />
        </button>
        )}
    </div>
    <button 
        className={`${styles.controlButton} ${!canUndo ? styles.disabled : ''}`}
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
    >
        <FontAwesomeIcon icon={faUndo} />
    </button>
    <button 
        className={`${styles.controlButton} ${!canRedo ? styles.disabled : ''}`}
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
    >
        <FontAwesomeIcon icon={faRedo} />
    </button>
    <button 
        className={styles.controlButton + ' ' + styles.settings}
        onClick={() => setShowAudioSettingsModal(true)}
        title="Audio Settings"
    >
        <FontAwesomeIcon icon={faCog} />
    </button>
    </div>

    {/* Audio Settings Modal */}
    <AudioSettings
      showAudioSettingsModal={showAudioSettingsModal}
      setShowAudioSettingsModal={setShowAudioSettingsModal}
    />
    </>
  );
};

export default TransportControls;