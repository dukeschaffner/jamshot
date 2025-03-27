'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import TagSelector from './TagSelector';
import { FaInfoCircle } from 'react-icons/fa';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import './UploadForm.css';
import { audioBufferToWav } from '../lib/utils';

export default function UploadForm({ 
  isCollab = false, 
  recordingAudioBuffer = null, 
  parentTrack = null,
  onCancel = null
}) {
  const [title, setTitle] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [error, setError] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [metronomeBpm, setMetronomeBpm] = useState('');
  const [fileName, setFileName] = useState('');
  const router = useRouter();

  const handleTagChange = ({ genreIds, instrumentIds }) => {
    setSelectedGenres(genreIds);
    setSelectedInstruments(instrumentIds);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check if file is an audio file
    if (!file.type.startsWith('audio/')) {
      setError('Please select an audio file');
      return;
    }
    
    setAudioFile(file);
    setFileName(file.name);
    setError('');
  };

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
      setError('Please select an audio file');
      return;
    }
    
    setAudioFile(file);
    setFileName(file.name);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // For regular upload, check if audio file is selected
    if (!isCollab && !audioFile) {
      setError('Please select an audio file');
      return;
    }
    
    // For collab upload, check if recording buffer exists
    if (isCollab && !recordingAudioBuffer) {
      setError('No audio recording found');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('title', title);
      
      // Add audio file or recording buffer
      if (isCollab && recordingAudioBuffer) {
        try {
          // Convert recording buffer to WAV format
          const numberOfChannels = recordingAudioBuffer.numberOfChannels || 1;
          const sampleRate = recordingAudioBuffer.sampleRate || 44100;
          
          // Create a WAV file from the audio buffer
          const wavBuffer = audioBufferToWav(recordingAudioBuffer);
          const blob = new Blob([wavBuffer], { type: 'audio/wav' });
          formData.append('audio', blob, 'recording.wav');
          
          // Add parent track ID for collab
          if (parentTrack && parentTrack.id) {
            formData.append('parent_track_id', parentTrack.id);
          }
        } catch (audioError) {
          console.error('Error processing audio buffer:', audioError);
          setError('Error processing audio: ' + audioError.message);
          return;
        }
      } else {
        formData.append('audio', audioFile);
      }
      
      // Add genre and instrument IDs
      if (selectedGenres.length > 0) {
        formData.append('genreIds', JSON.stringify(selectedGenres));
      }
      
      if (selectedInstruments.length > 0) {
        formData.append('instrumentIds', JSON.stringify(selectedInstruments));
      }

      // Add metronome BPM if provided
      if (metronomeBpm) {
        formData.append('metronome_bpm', metronomeBpm);
      }

      const response = await api.post('/tracks/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      // If this is a collab and there's a cancel handler, call it
      if (isCollab && onCancel) {
        onCancel();
        return;
      }
      
      // Otherwise, redirect to home
      router.push('/');
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Upload failed: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">
        Publish your track
      </h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">Track Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title for your track"
            className="w-full p-2 border rounded"
            required
          />
        </div>
        
        <div>
          <label htmlFor="metronome" className="block text-sm font-medium mb-1">Metronome (BPM)</label>
          <div className="flex items-center">
            <input
              id="metronome"
              type="number"
              min="40"
              max="240"
              value={metronomeBpm}
              onChange={(e) => setMetronomeBpm(e.target.value)}
              placeholder={parentTrack?.metronome_bpm || "e.g., 120"}
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded flex items-start">
            <FaInfoCircle className="text-blue-500 mt-1 mr-2 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Important:</strong> Only specify a metronome BPM if your track actually follows this tempo precisely. 
              This helps collaborators stay in sync with your track. Leave blank if unsure.
            </p>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Tags</label>
          <TagSelector 
            selectedGenres={selectedGenres}
            selectedInstruments={selectedInstruments}
            onChange={handleTagChange}
            maxGenres={2}
            maxInstruments={4}
          />
        </div>
        
        {error && <p className="text-red-500">{error}</p>}
        
        <div className="flex space-x-4">
          {onCancel && (
            <button 
              type="button" 
              onClick={onCancel}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded transition"
            >
              Cancel
            </button>
          )}
          <button 
            type="submit" 
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition"
          >
            Upload
          </button>
        </div>
      </form>
    </div>
  );
} 