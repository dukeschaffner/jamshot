'use client';

export default function TrackTags({ genres = [], instruments = [], compact = false }) {
  if (!genres.length && !instruments.length) {
    return null;
  }

  if (compact) {
    // For compact view, show only the first tag of each type with a count
    const genreCount = genres.length;
    const instrumentCount = instruments.length;
    
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {genreCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
            {genres[0].name}{genreCount > 1 ? ` +${genreCount - 1}` : ''}
          </span>
        )}
        
        {instrumentCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
            {instruments[0].name}{instrumentCount > 1 ? ` +${instrumentCount - 1}` : ''}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {genres.map(genre => (
        <span 
          key={genre.id} 
          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800"
        >
          {genre.name}
        </span>
      ))}
      
      {instruments.map(instrument => (
        <span 
          key={instrument.id} 
          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-800"
        >
          {instrument.name}
        </span>
      ))}
    </div>
  );
} 