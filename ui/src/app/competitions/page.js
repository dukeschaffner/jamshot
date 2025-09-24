'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../contexts/UserContext';
import { FaTrophy, FaPlus, FaFilter, FaSearch, FaCalendarAlt, FaUsers, FaDollarSign, FaClock, FaExclamationTriangle, FaCheckCircle, FaPlay, FaTimes } from 'react-icons/fa';
import { competitionApi, tagApi } from '../../lib/api';
import Competition from '../../components/Competition';
import SponsoredCompetition from '../../components/SponsoredCompetition';
import LoadingSpinner from '../../components/LoadingSpinner';
import styles from './Competitions.module.css';

export default function CompetitionsPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useUser();
  
  // State
  const [activeTab, setActiveTab] = useState('active');
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    genreId: '',
    instrumentId: '',
    pinned: false
  });
  const [showFilters, setShowFilters] = useState(false);

  // Tag data for dropdowns
  const [genres, setGenres] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(true);

  // Load competitions based on current tab and filters
  const loadCompetitions = async (page = 1, reset = false) => {
    try {
      setLoading(reset);
      setLoadingMore(!reset);
      
      const params = {
        page,
        limit: 10,
        status: activeTab,
        ...filters,
        excludeSponsored: true
      };
      
      const response = await competitionApi.getCompetitions(params);
      const { competitions: newCompetitions, pagination } = response.data;
      
      if (reset) {
        setCompetitions(newCompetitions || []);
      } else {
        setCompetitions(prev => [...prev, ...(newCompetitions || [])]);
      }
      
      setHasMore(pagination?.hasMore || false);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error loading competitions:', err);
      setError('Failed to load competitions');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load more competitions
  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadCompetitions(currentPage + 1, false);
    }
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setCompetitions([]);
    setHasMore(false);
  };

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Apply filters
  const applyFilters = () => {
    setCurrentPage(1);
    setCompetitions([]);
    setHasMore(false);
    loadCompetitions(1, true);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      genreId: '',
      instrumentId: '',
      pinned: false
    });
  };

  // Handle create competition modal actions
  const handleCreateFromNewTrack = () => {
    setShowCreateModal(false);
    router.push('/upload?createCompetition=true');
  };

  const handleCreateFromExistingTrack = () => {
    setShowCreateModal(false);
    router.push('/competition/create');
  };

  // Load competitions when tab or filters change
  useEffect(() => {
    loadCompetitions(1, true);
  }, [activeTab]);

  // Apply filters when they change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (activeTab) {
        applyFilters();
      }
    }, 500); // Debounce filter changes

    return () => clearTimeout(timeoutId);
  }, [filters]);

  // Load genres and instruments for filter dropdowns
  useEffect(() => {
    const loadTags = async () => {
      try {
        setTagsLoading(true);
        const [genresResponse, instrumentsResponse] = await Promise.all([
          tagApi.getGenres(),
          tagApi.getInstruments()
        ]);

        setGenres(genresResponse.data || []);
        setInstruments(instrumentsResponse.data || []);
      } catch (err) {
        console.error('Error loading tags:', err);
        // Set empty arrays so dropdowns show "All Genres/Instruments" option
        setGenres([]);
        setInstruments([]);
      } finally {
        setTagsLoading(false);
      }
    };

    loadTags();
  }, []);


  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'active':
        return 'No active competitions at the moment. Check back soon!';
      case 'upcoming':
        return 'No upcoming competitions scheduled.';
      case 'my_entries':
        return 'You haven\'t entered any competitions yet.';
      case 'my_hosted':
        return 'You haven\'t hosted any competitions yet.';
      default:
        return 'No competitions found.';
    }
  };

  return (
    <div className={styles.competitionsPage}>
      {/* Header */}
      <div className="about-header">
        <h1 className="about-title">
          <FaTrophy style={{ marginRight: '12px' }} />
          Competitions
        </h1>
        <p className="about-subtitle">
          Discover and participate in music competitions
        </p>
      </div>

      {/* Sponsored Competition Banner */}
      <SponsoredCompetition variant="banner" />

      {/* Create Competition Button */}
      {isAuthenticated && (
        <div className={styles.createButtonContainer}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="pill-btn gradient-btn"
          >
            <FaPlus style={{ marginRight: '8px' }} />
            Create Competition
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'active' ? styles.activeTab : ''}`}
            onClick={() => handleTabChange('active')}
          >
            <FaPlay style={{ marginRight: '8px' }} />
            Active
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'upcoming' ? styles.activeTab : ''}`}
            onClick={() => handleTabChange('upcoming')}
          >
            <FaClock style={{ marginRight: '8px' }} />
            Upcoming
          </button>
          {isAuthenticated && (
            <>
              <button
                className={`${styles.tab} ${activeTab === 'my_entries' ? styles.activeTab : ''}`}
                onClick={() => handleTabChange('my_entries')}
              >
                <FaUsers style={{ marginRight: '8px' }} />
                My Entries
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'my_hosted' ? styles.activeTab : ''}`}
                onClick={() => handleTabChange('my_hosted')}
              >
                <FaTrophy style={{ marginRight: '8px' }} />
                My Hosted
              </button>
            </>
          )}
        </div>
        
        {/* Filter Toggle */}
        <button
          className={`pill-btn ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <FaFilter style={{ marginRight: '8px' }} />
          Filters
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className={styles.filtersPanel}>
          <div className={styles.filterGroup}>
            <label htmlFor="genreFilter">Genre</label>
            <select
              id="genreFilter"
              value={filters.genreId}
              onChange={(e) => handleFilterChange('genreId', e.target.value)}
              className={styles.filterSelect}
              disabled={tagsLoading}
            >
              <option value="">All Genres</option>
              {genres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className={styles.filterGroup}>
            <label htmlFor="instrumentFilter">Instrument</label>
            <select
              id="instrumentFilter"
              value={filters.instrumentId}
              onChange={(e) => handleFilterChange('instrumentId', e.target.value)}
              className={styles.filterSelect}
              disabled={tagsLoading}
            >
              <option value="">All Instruments</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className={styles.filterGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={filters.pinned}
                onChange={(e) => handleFilterChange('pinned', e.target.checked)}
              />
              <span>Pinned Only</span>
            </label>
          </div>
          
          <div className={styles.filterActions}>
            <button
              onClick={clearFilters}
              className="pill-btn"
            >
              Clear
            </button>
            <button
              onClick={() => setShowFilters(false)}
              className="pill-btn gradient-btn"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <LoadingSpinner />
            <p>Loading competitions...</p>
          </div>
        ) : error ? (
          <div className={styles.errorContainer}>
            <FaExclamationTriangle />
            <p>{error}</p>
            <button
              onClick={() => loadCompetitions(1, true)}
              className="pill-btn gradient-btn"
            >
              Try Again
            </button>
          </div>
        ) : competitions.length === 0 ? (
          <div className={styles.emptyContainer}>
            <FaTrophy />
            <h3>No Competitions Found</h3>
            <p>{getEmptyMessage()}</p>
          </div>
        ) : (
          <div className={styles.competitionsList}>
            {competitions.map((competition) => (
              <Competition
                key={competition.id}
                competition={competition}
                allTracks={[]} // This would be populated with related tracks
                setExpandedTrackId={() => {}}
                expandedTrackId={null}
              />
            ))}
            
            {/* Load More Button */}
            {hasMore && (
              <div className={styles.loadMoreContainer}>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="pill-btn"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Competition Modal */}
      {showCreateModal && (
        <div
          className="modal-overlay active"
          onClick={(e) => {
            if (e.target.className === 'modal-overlay active') {
              setShowCreateModal(false);
            }
          }}
        >
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Create Competition</h2>
              <button
                className="close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                <FaTimes />
              </button>
            </div>
            <div style={{ padding: '2rem', display: 'flex', gap: '1rem', flexDirection: 'column' }}>
              <div
                className={styles.competitionOption}
                onClick={handleCreateFromNewTrack}
              >
                <div className={styles.optionIcon}>
                  <FaPlus style={{ fontSize: '2rem' }} />
                </div>
                <div className={styles.optionContent}>
                  <h3>Create from New Track</h3>
                  <p>Upload a new track and create a competition around it</p>
                </div>
              </div>

              <div
                className={styles.competitionOption}
                onClick={handleCreateFromExistingTrack}
              >
                <div className={styles.optionIcon}>
                  <FaTrophy style={{ fontSize: '2rem' }} />
                </div>
                <div className={styles.optionContent}>
                  <h3>Create from Existing Track</h3>
                  <p>Use one of your existing tracks to create a competition</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
