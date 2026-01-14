'use client';
import { useState, useEffect, useRef } from 'react';
import { FaFilter, FaTimes, FaChevronDown } from 'react-icons/fa';
import api from '../lib/api';
import styles from './TagFilter.module.css';

export default function TagFilter({
  selectedGenres = [],
  selectedInstruments = [],
  selectedElements = [],
  selectedInstrumentRequests = [],
  selectedElementRequests = [],
  onChange,
  className = ''
}) {
  const [genres, setGenres] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const containerRef = useRef(null);

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
      } catch (err) {
        console.error('Error fetching tags:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTags();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsExpanded(false);
        setActiveSection(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGenreChange = (genreId) => {
    const updatedGenres = selectedGenres.includes(genreId)
      ? selectedGenres.filter(id => id !== genreId)
      : [...selectedGenres, genreId];

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
      : [...selectedInstruments, instrumentId];

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
      : [...selectedElements, elementId];

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
      : [...selectedInstrumentRequests, instrumentId];

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
      : [...selectedElementRequests, elementId];

    onChange({
      genreIds: selectedGenres,
      instrumentIds: selectedInstruments,
      elementIds: selectedElements,
      instrumentRequestIds: selectedInstrumentRequests,
      elementRequestIds: updatedElementRequests
    });
  };

  const clearAllFilters = () => {
    onChange({
      genreIds: [],
      instrumentIds: [],
      elementIds: [],
      instrumentRequestIds: [],
      elementRequestIds: []
    });
  };

  const getSelectedCount = () => {
    return selectedGenres.length + selectedInstruments.length + selectedElements.length +
           selectedInstrumentRequests.length + selectedElementRequests.length;
  };

  const getSelectedLabels = () => {
    const labels = [];

    selectedGenres.forEach(id => {
      const genre = genres.find(g => g.id === id);
      if (genre) labels.push(genre.name);
    });

    selectedInstruments.forEach(id => {
      const instrument = instruments.find(i => i.id === id);
      if (instrument) labels.push(instrument.name);
    });

    selectedElements.forEach(id => {
      const element = elements.find(e => e.id === id);
      if (element) labels.push(element.name);
    });

    selectedInstrumentRequests.forEach(id => {
      const instrument = instruments.find(i => i.id === id);
      if (instrument) labels.push(`Request: ${instrument.name}`);
    });

    selectedElementRequests.forEach(id => {
      const element = elements.find(e => e.id === id);
      if (element) labels.push(`Request: ${element.name}`);
    });

    return labels;
  };

  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? null : section);
  };

  if (loading) {
    return (
      <div className={`${styles.tagFilter} ${className}`}>
        <div className={styles.filterButton}>
          <FaFilter />
          <span>Loading filters...</span>
        </div>
      </div>
    );
  }

  const selectedCount = getSelectedCount();
  const selectedLabels = getSelectedLabels();

  return (
    <div className={`${styles.tagFilter} ${className}`} ref={containerRef}>
      <button
        className={`${styles.filterButton} ${selectedCount > 0 ? styles.active : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-haspopup="true"
      >
        <FaFilter />
        <span>
          {selectedCount > 0
            ? `${selectedCount} filter${selectedCount > 1 ? 's' : ''} selected`
            : 'Filter by tags'
          }
        </span>
        <FaChevronDown className={`${styles.chevron} ${isExpanded ? styles.rotated : ''}`} />
      </button>

      {isExpanded && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h3>Filter by Tags</h3>
            {selectedCount > 0 && (
              <button
                className={styles.clearButton}
                onClick={clearAllFilters}
                aria-label="Clear all filters"
              >
                Clear all
              </button>
            )}
          </div>

          {selectedLabels.length > 0 && (
            <div className={styles.selectedTags}>
              {selectedLabels.slice(0, 5).map((label, index) => (
                <span key={index} className={styles.selectedTag}>
                  {label}
                </span>
              ))}
              {selectedLabels.length > 5 && (
                <span className={styles.selectedTag}>
                  +{selectedLabels.length - 5} more
                </span>
              )}
            </div>
          )}

          <div className={styles.filterSections}>
            {/* Genres Section */}
            <div className={styles.filterSection}>
              <button
                className={`${styles.sectionToggle} ${activeSection === 'genres' ? styles.active : ''}`}
                onClick={() => toggleSection('genres')}
                aria-expanded={activeSection === 'genres'}
              >
                Genres ({selectedGenres.length})
                <FaChevronDown className={`${styles.sectionChevron} ${activeSection === 'genres' ? styles.rotated : ''}`} />
              </button>
              {activeSection === 'genres' && (
                <div className={styles.tagGrid}>
                  {genres.map(genre => (
                    <label key={genre.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedGenres.includes(genre.id)}
                        onChange={() => handleGenreChange(genre.id)}
                      />
                      <span className={styles.checkboxText}>{genre.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Instruments Section */}
            <div className={styles.filterSection}>
              <button
                className={`${styles.sectionToggle} ${activeSection === 'instruments' ? styles.active : ''}`}
                onClick={() => toggleSection('instruments')}
                aria-expanded={activeSection === 'instruments'}
              >
                Instruments ({selectedInstruments.length})
                <FaChevronDown className={`${styles.sectionChevron} ${activeSection === 'instruments' ? styles.rotated : ''}`} />
              </button>
              {activeSection === 'instruments' && (
                <div className={styles.tagGrid}>
                  {instruments.map(instrument => (
                    <label key={instrument.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedInstruments.includes(instrument.id)}
                        onChange={() => handleInstrumentChange(instrument.id)}
                      />
                      <span className={styles.checkboxText}>{instrument.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Elements Section */}
            <div className={styles.filterSection}>
              <button
                className={`${styles.sectionToggle} ${activeSection === 'elements' ? styles.active : ''}`}
                onClick={() => toggleSection('elements')}
                aria-expanded={activeSection === 'elements'}
              >
                Elements ({selectedElements.length})
                <FaChevronDown className={`${styles.sectionChevron} ${activeSection === 'elements' ? styles.rotated : ''}`} />
              </button>
              {activeSection === 'elements' && (
                <div className={styles.tagGrid}>
                  {elements.map(element => (
                    <label key={element.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedElements.includes(element.id)}
                        onChange={() => handleElementChange(element.id)}
                      />
                      <span className={styles.checkboxText}>{element.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Requested Instruments Section */}
            <div className={styles.filterSection}>
              <button
                className={`${styles.sectionToggle} ${activeSection === 'instrumentRequests' ? styles.active : ''}`}
                onClick={() => toggleSection('instrumentRequests')}
                aria-expanded={activeSection === 'instrumentRequests'}
              >
                Requested Instruments ({selectedInstrumentRequests.length})
                <FaChevronDown className={`${styles.sectionChevron} ${activeSection === 'instrumentRequests' ? styles.rotated : ''}`} />
              </button>
              {activeSection === 'instrumentRequests' && (
                <div className={styles.tagGrid}>
                  {instruments.map(instrument => (
                    <label key={instrument.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedInstrumentRequests.includes(instrument.id)}
                        onChange={() => handleInstrumentRequestChange(instrument.id)}
                      />
                      <span className={styles.checkboxText}>{instrument.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Requested Elements Section */}
            <div className={styles.filterSection}>
              <button
                className={`${styles.sectionToggle} ${activeSection === 'elementRequests' ? styles.active : ''}`}
                onClick={() => toggleSection('elementRequests')}
                aria-expanded={activeSection === 'elementRequests'}
              >
                Requested Elements ({selectedElementRequests.length})
                <FaChevronDown className={`${styles.sectionChevron} ${activeSection === 'elementRequests' ? styles.rotated : ''}`} />
              </button>
              {activeSection === 'elementRequests' && (
                <div className={styles.tagGrid}>
                  {elements.map(element => (
                    <label key={element.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedElementRequests.includes(element.id)}
                        onChange={() => handleElementRequestChange(element.id)}
                      />
                      <span className={styles.checkboxText}>{element.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
