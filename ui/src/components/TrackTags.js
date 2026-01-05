'use client';

export default function TrackTags({ track }) {
  if (!track) return null;
  
  const hasGenres = track.genres && Array.isArray(track.genres) && track.genres.length > 0;
  const hasInstruments = track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0;
  const hasElements = track.elements && Array.isArray(track.elements) && track.elements.length > 0;
  const hasInstrumentRequests = track.instrument_requests && Array.isArray(track.instrument_requests) && track.instrument_requests.length > 0;
  const hasElementRequests = track.element_requests && Array.isArray(track.element_requests) && track.element_requests.length > 0;
  
  if (!hasGenres && !hasInstruments && !hasElements && !hasInstrumentRequests && !hasElementRequests) return null;
  
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

      {hasElements && track.elements.map((element, index) => (
        <span key={`element-${element.id || index}`} className="track-tag element-tag">
          {typeof element === 'string' ? element : element.name}
        </span>
      ))}

      {hasInstrumentRequests && track.instrument_requests.map((instrument, index) => (
        <span key={`instrument-request-${instrument.id || index}`} className="track-tag instrument-request-tag">
          Requested: {typeof instrument === 'string' ? instrument : instrument.name}
        </span>
      ))}

      {hasElementRequests && track.element_requests.map((element, index) => (
        <span key={`element-request-${element.id || index}`} className="track-tag element-request-tag">
          Requested: {typeof element === 'string' ? element : element.name}
        </span>
      ))}
    </div>
  );
}
