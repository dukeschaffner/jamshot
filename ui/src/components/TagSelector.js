'use client';
import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function TagSelector({ 
  selectedGenres = [], 
  selectedInstruments = [], 
  onChange,
  parentGenres = [],
  readOnlyGenres = false,
  maxGenres = 2,
  maxInstruments = 4
}) {
  const [genres, setGenres] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTags = async () => {
      try {
        setLoading(true);
        const [genresResponse, instrumentsResponse] = await Promise.all([
          api.get('/tags/genres'),
          api.get('/tags/instruments')
        ]);
        setGenres(genresResponse.data);
        setInstruments(instrumentsResponse.data);
        setError('');
      } catch (err) {
        console.error('Error fetching tags:', err);
        setError('Failed to load genres and instruments');
      } finally {
        setLoading(false);
      }
    };

    fetchTags();
  }, []);

  const handleGenreChange = (genreId) => {
    if (readOnlyGenres) return;
    
    const updatedGenres = selectedGenres.includes(genreId)
      ? selectedGenres.filter(id => id !== genreId)
      : selectedGenres.length < maxGenres 
        ? [...selectedGenres, genreId]
        : selectedGenres;
    
    onChange({
      genreIds: updatedGenres,
      instrumentIds: selectedInstruments
    });
  };

  const handleInstrumentChange = (instrumentId) => {
    const updatedInstruments = selectedInstruments.includes(instrumentId)
      ? selectedInstruments.filter(id => id !== instrumentId)
      : selectedInstruments.length < maxInstruments
        ? [...selectedInstruments, instrumentId]
        : selectedInstruments;
    
    onChange({
      genreIds: selectedGenres,
      instrumentIds: updatedInstruments
    });
  };

  if (loading) return <div className="text-gray-500">Loading tags...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium mb-2">
          Genres {!readOnlyGenres && <span className="text-sm text-gray-500">(max {maxGenres})</span>}
        </h3>
        
        {parentGenres.length > 0 && (
          <div className="mb-2">
            <p className="text-sm text-gray-600 mb-1">Parent track genres:</p>
            <div className="flex flex-wrap gap-2">
              {parentGenres.map(genre => (
                <span
                  key={genre.id}
                  className="px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                >
                  {genre.name}
                </span>
              ))}
            </div>
            {!readOnlyGenres && (
              <p className="text-sm text-gray-600 mt-1">Only select genres if different from parent track.</p>
            )}
          </div>
        )}
        
        <div className="flex flex-wrap gap-2">
          {genres.map(genre => (
            <button
              key={genre.id}
              type="button"
              onClick={() => handleGenreChange(genre.id)}
              disabled={readOnlyGenres || (selectedGenres.length >= maxGenres && !selectedGenres.includes(genre.id))}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedGenres.includes(genre.id)
                  ? 'bg-blue-500 text-white'
                  : readOnlyGenres
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : selectedGenres.length >= maxGenres
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <h3 className="font-medium mb-2">Instruments <span className="text-sm text-gray-500">(max {maxInstruments})</span></h3>
        <div className="flex flex-wrap gap-2">
          {instruments.map(instrument => (
            <button
              key={instrument.id}
              type="button"
              onClick={() => handleInstrumentChange(instrument.id)}
              disabled={selectedInstruments.length >= maxInstruments && !selectedInstruments.includes(instrument.id)}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedInstruments.includes(instrument.id)
                  ? 'bg-green-500 text-white'
                  : selectedInstruments.length >= maxInstruments
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {instrument.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 