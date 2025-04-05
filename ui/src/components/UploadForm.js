'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import TagSelector from './TagSelector';
import { FaInfoCircle } from 'react-icons/fa';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faLock } from '@fortawesome/free-solid-svg-icons';
import './UploadForm.css';
import { audioBufferToWav } from '../lib/utils';

export default function UploadForm({ 
  isCollab = false, 
  recordingAudioBuffer = null, 
  parentTrack = null,
  onCancel = null
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [metronomeBpm, setMetronomeBpm] = useState('');
  const [fileName, setFileName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const router = useRouter();

  const handleTagChange = ({ genreIds, instrumentIds }) => {
    setSelectedGenres(genreIds);
    setSelectedInstruments(instrumentIds);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // For collab upload, check if recording buffer exists
    if (!recordingAudioBuffer) {
      setError('No audio recording found');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('title', title);
      
      // Add audio file or recording buffer
      if (recordingAudioBuffer) {
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
      
      // Add privacy setting (only for non-collab tracks)
      if (!isCollab) {
        formData.append('is_private', isPrivate);
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
        
        {/* Privacy option - only show for non-collab tracks */}
        {!isCollab && (
          <div className="flex items-center space-x-2 mt-4">
            <input
              type="checkbox"
              id="isPrivate"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="isPrivate" className="flex items-center text-sm">
              <FontAwesomeIcon icon={faLock} className="mr-2 text-gray-600" />
              Make this track private
              <span className="ml-2 text-xs text-gray-500">(Only you will be able to see it)</span>
            </label>
          </div>
        )}
        
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