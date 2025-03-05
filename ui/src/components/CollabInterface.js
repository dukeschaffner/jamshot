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
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showRecordingSection, setShowRecordingSection] = useState(false);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [fileName, setFileName] = useState('');
  const [originalAudioChunks, setOriginalAudioChunks] = useState(null);
  const [recordingAudioChunks, setRecordingAudioChunks] = useState(null);
  
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
      
    } catch (error) {
      console.error('Error processing dropped file:', error);
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
        setIsPlaying={setIsPlaying}
        trackDuration={trackDuration}
        showCollabModal={showCollabModal}
        originalAudioChunks={originalAudioChunks}
        recordingAudioChunks={recordingAudioChunks}
      />

      {/* Recording Section */}
      

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