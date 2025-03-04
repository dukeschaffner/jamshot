'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';
import TagSelector from '../../components/TagSelector';
import { FaInfoCircle } from 'react-icons/fa';

export default function Upload() {
  const [title, setTitle] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [error, setError] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [metronomeBpm, setMetronomeBpm] = useState('');
  const router = useRouter();

  const handleTagChange = ({ genreIds, instrumentIds }) => {
    setSelectedGenres(genreIds);
    setSelectedInstruments(instrumentIds);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!audioFile) {
      setError('Please select an audio file');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('audio', audioFile);
    
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

    try {
      await api.post('/tracks/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      router.push('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Upload a Track</h1>
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
          <label htmlFor="audio" className="block text-sm font-medium mb-1">Audio File</label>
          <input
            id="audio"
            type="file"
            accept="audio/*"
            onChange={(e) => setAudioFile(e.target.files[0])}
            className="w-full p-2 border rounded"
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
              placeholder="e.g., 120"
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
        <button 
          type="submit" 
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition"
        >
          Upload
        </button>
      </form>
    </div>
  );
}