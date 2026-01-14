'use client';
import { useState, useEffect } from 'react';
import api from '../lib/api';
import styles from './TagSelector.module.css';

export default function TagSelector({ 
  selectedGenres = [], 
  selectedInstruments = [], 
  selectedElements = [],
  selectedInstrumentRequests = [],
  selectedElementRequests = [],
  onChange,
  parentGenres = [],
  readOnlyGenres = false,
  maxGenres = 2,
  maxInstruments = 4,
  maxElements = 2,
  maxInstrumentRequests = 2,
  maxElementRequests = 2
}) {
  const [genres, setGenres] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSection, setExpandedSection] = useState(null);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        setLoading(true);
        const [genresResponse, instrumentsResponse, elementsResponse] = await Promise.all([
          api.get('/tags/genres'),
          api.get('/tags/instruments'),
          api.get('/tags/elements')
        ]);
        setGenres(genresResponse.data);
        setInstruments(instrumentsResponse.data);
        setElements(elementsResponse.data);
        setError('');
      } catch (err) {
        console.error('Error fetching tags:', err);
        setError('Failed to load tags');
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
      instrumentIds: selectedInstruments,
      elementIds: selectedElements,
      instrumentRequestIds: selectedInstrumentRequests,
      elementRequestIds: selectedElementRequests
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
      instrumentIds: updatedInstruments,
      elementIds: selectedElements,
      instrumentRequestIds: selectedInstrumentRequests,
      elementRequestIds: selectedElementRequests
    });
  };

  const handleElementChange = (elementId) => {
    const updatedElements = selectedElements.includes(elementId)
      ? selectedElements.filter(id => id !== elementId)
      : selectedElements.length < maxElements
        ? [...selectedElements, elementId]
        : selectedElements;
    
    onChange({
      genreIds: selectedGenres,
      instrumentIds: selectedInstruments,
      elementIds: updatedElements,
      instrumentRequestIds: selectedInstrumentRequests,
      elementRequestIds: selectedElementRequests
    });
  };

  const handleInstrumentRequestChange = (instrumentId) => {
    const updatedInstrumentRequests = selectedInstrumentRequests.includes(instrumentId)
      ? selectedInstrumentRequests.filter(id => id !== instrumentId)
      : selectedInstrumentRequests.length < maxInstrumentRequests
        ? [...selectedInstrumentRequests, instrumentId]
        : selectedInstrumentRequests;
    
    onChange({
      genreIds: selectedGenres,
      instrumentIds: selectedInstruments,
      elementIds: selectedElements,
      instrumentRequestIds: updatedInstrumentRequests,
      elementRequestIds: selectedElementRequests
    });
  };

  const handleElementRequestChange = (elementId) => {
    const updatedElementRequests = selectedElementRequests.includes(elementId)
      ? selectedElementRequests.filter(id => id !== elementId)
      : selectedElementRequests.length < maxElementRequests
        ? [...selectedElementRequests, elementId]
        : selectedElementRequests;
    
    onChange({
      genreIds: selectedGenres,
      instrumentIds: selectedInstruments,
      elementIds: selectedElements,
      instrumentRequestIds: selectedInstrumentRequests,
      elementRequestIds: updatedElementRequests
    });
  };

  const toggleSection = (sectionName) => {
    setExpandedSection(expandedSection === sectionName ? null : sectionName);
  };

  if (loading) return <div className="text-gray-500">Loading tags...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  const accordionSections = [
    {
      id: 'genres',
      title: `Genres ${!readOnlyGenres ? `(max ${maxGenres})` : ''}`,
      content: (
        <div>
          {parentGenres.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-secondary mb-2">Parent track genres:</p>
              <div className="flex flex-wrap gap-2">
                {parentGenres.map(genre => (
                  <span
                    key={genre.id}
                    className="px-3 py-1 rounded-full text-sm"
                    style={{ backgroundColor: 'var(--seafoam-light)', color: 'var(--s2)' }}
                  >
                    {genre.name}
                  </span>
                ))}
              </div>
              {!readOnlyGenres && (
                <p className="text-sm text-secondary mt-2">Only select genres if different from parent track.</p>
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
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedGenres.includes(genre.id)
                    ? styles.active
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
      )
    },
    {
      id: 'instruments',
      title: `Instruments (max ${maxInstruments})`,
      content: (
        <div className="flex flex-wrap gap-2">
          {instruments.map(instrument => (
            <button
              key={instrument.id}
              type="button"
              onClick={() => handleInstrumentChange(instrument.id)}
              disabled={selectedInstruments.length >= maxInstruments && !selectedInstruments.includes(instrument.id)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedInstruments.includes(instrument.id)
                  ? styles.active
                  : selectedInstruments.length >= maxInstruments
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {instrument.name}
            </button>
          ))}
        </div>
      )
    },
    {
      id: 'elements',
      title: `Elements (max ${maxElements})`,
      content: (
        <div className="flex flex-wrap gap-2">
          {elements.map(element => (
            <button
              key={element.id}
              type="button"
              onClick={() => handleElementChange(element.id)}
              disabled={selectedElements.length >= maxElements && !selectedElements.includes(element.id)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedElements.includes(element.id)
                  ? styles.active
                  : selectedElements.length >= maxElements
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {element.name}
            </button>
          ))}
        </div>
      )
    },
    {
      id: 'requested-instruments',
      title: `Requested Instruments (max ${maxInstrumentRequests})`,
      content: (
        <div>
          <p className="text-sm text-secondary mb-3">What instruments would you like collaborators to add?</p>
          <div className="flex flex-wrap gap-2">
            {instruments.map(instrument => (
              <button
                key={instrument.id}
                type="button"
                onClick={() => handleInstrumentRequestChange(instrument.id)}
                disabled={selectedInstrumentRequests.length >= maxInstrumentRequests && !selectedInstrumentRequests.includes(instrument.id)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedInstrumentRequests.includes(instrument.id)
                    ? styles.active
                    : selectedInstrumentRequests.length >= maxInstrumentRequests
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {instrument.name}
              </button>
            ))}
          </div>
        </div>
      )
    },
    {
      id: 'requested-elements',
      title: `Requested Elements (max ${maxElementRequests})`,
      content: (
        <div>
          <p className="text-sm text-secondary mb-3">What elements would you like collaborators to add?</p>
          <div className="flex flex-wrap gap-2">
            {elements.map(element => (
              <button
                key={element.id}
                type="button"
                onClick={() => handleElementRequestChange(element.id)}
                disabled={selectedElementRequests.length >= maxElementRequests && !selectedElementRequests.includes(element.id)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedElementRequests.includes(element.id)
                    ? styles.active
                    : selectedElementRequests.length >= maxElementRequests
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {element.name}
              </button>
            ))}
          </div>
        </div>
      )
    }
  ];

  return (
    <div className={styles.accordion}>
      {accordionSections.map((section) => (
        <div key={section.id} className={styles.accordionItem}>
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className={`${styles.accordionHeader} ${expandedSection === section.id ? styles.expanded : ''}`}
          >
            <span className={styles.accordionTitle}>{section.title}</span>
            <svg
              className={`${styles.accordionIcon} ${expandedSection === section.id ? styles.rotated : ''}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className={`${styles.accordionContent} ${expandedSection === section.id ? styles.expanded : ''}`}>
            <div className={styles.accordionContentInner}>
              {section.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
