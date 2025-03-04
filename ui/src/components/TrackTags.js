'use client';

export default function TrackTags({ track }) {
  if (!track) return null;
  
  const hasGenres = track.genres && Array.isArray(track.genres) && track.genres.length > 0;
  const hasInstruments = track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0;
  
  if (!hasGenres && !hasInstruments) return null;
  
  return (
    <div className="track-tags">
      {hasGenres && track.genres.map((genre, index) => (
        <span key={`genre-${genre.id || index}`} className="track-tag genre-tag">
          {typeof genre === 'string' ? genre : genre.name}
        </span>
      ))}
      
      {hasInstruments && track.instruments.map((instrument, index) => (
        <span key={`instrument-${instrument.id || index}`} className="track-tag instrument-tag">
          {typeof instrument === 'string' ? instrument : instrument.name}
        </span>
      ))}
    </div>
  );
} 