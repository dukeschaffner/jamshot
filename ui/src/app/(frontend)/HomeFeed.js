'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import Track from '@/components/Track';
import InfiniteScrollContainer from '@/components/InfiniteScrollContainer';
import CustomTabs from '@/components/CustomTabs';
import SponsoredCompetition from '@/components/SponsoredCompetition';
import SupportBetaCTA from '@/components/SupportBetaCTA';
import TagFilter from '@/components/TagFilter';
import { FaTimes, FaInfoCircle, FaMicrophone, FaMusic } from 'react-icons/fa';
import { useUser } from '@/contexts/UserContext';
import { useMobile } from '@/contexts/MobileContext';
import { trackWelcomeDialogClose, trackFeedChange, trackTrackExpand } from '@/lib/analytics';
import styles from './Home.module.css';
import { SUBSCRIPTION_TIERS } from '@sterio/subscription-utils';



export default function HomeFeed() {
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [feedType, setFeedType] = useState(null); // Options: 'following', 'popular'
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const TRACKS_PER_PAGE = 5;
  const { isAuthenticated, isLoading, userPlan } = useUser();
  const { isMobile } = useMobile();
  const [hasSponsoredCompetition, setHasSponsoredCompetition] = useState(false);

  // Tag filter state
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [selectedElements, setSelectedElements] = useState([]);
  const [selectedInstrumentRequests, setSelectedInstrumentRequests] = useState([]);
  const [selectedElementRequests, setSelectedElementRequests] = useState([]);

  // Check if this is the first visit when component mounts
  useEffect(() => {
    const hasVisitedBefore = localStorage.getItem('sterio_visited');
    if (!hasVisitedBefore) {
      setShowWelcomeDialog(true);
      // Set the flag in localStorage so dialog won't show on future visits
      localStorage.setItem('sterio_visited', 'true');
    }
  }, []);

  useEffect(() => {
    // Only set feed type after authentication check is complete
    if (!isLoading) {
      if (isAuthenticated) {
        setFeedType('following');
      } else {
        setFeedType('popular');
      }
    }
  }, [isAuthenticated, isLoading]);

  const closeWelcomeDialog = () => {
    setShowWelcomeDialog(false);
    trackWelcomeDialogClose();
  };

  const fetchTracks = useCallback(async (pageNum) => {
    // feedType is passed via dependencies, so it will be current when this is called
    // But we check it anyway for safety
    if (!feedType) {
      return [];
    }

    // Call the appropriate endpoint based on feedType
    const endpoint = `/tracks/feed/${feedType}`;

    const params = {
      page: pageNum,
      limit: TRACKS_PER_PAGE
    };

    // Add tag filter parameters if any are selected
    if (selectedGenres.length > 0) {
      params.genreIds = selectedGenres.join(',');
    }
    if (selectedInstruments.length > 0) {
      params.instrumentIds = selectedInstruments.join(',');
    }
    if (selectedElements.length > 0) {
      params.elementIds = selectedElements.join(',');
    }
    if (selectedInstrumentRequests.length > 0) {
      params.instrumentRequestIds = selectedInstrumentRequests.join(',');
    }
    if (selectedElementRequests.length > 0) {
      params.elementRequestIds = selectedElementRequests.join(',');
    }

    const response = await api.get(endpoint, { params });

    // API returns array directly, InfiniteScrollContainer handles it
    return response.data;
  }, [feedType, selectedGenres, selectedInstruments, selectedElements, selectedInstrumentRequests, selectedElementRequests]);

  const handleFeedTypeChange = (newFeedType) => {
    if (newFeedType !== feedType) {
      setFeedType(newFeedType);
      setExpandedTrackId(null);
      // Reset tag filters when switching feed types
      setSelectedGenres([]);
      setSelectedInstruments([]);
      setSelectedElements([]);
      setSelectedInstrumentRequests([]);
      setSelectedElementRequests([]);
      trackFeedChange(newFeedType);
    }
  };

  const handleTagFilterChange = (filters) => {
    setSelectedGenres(filters.genreIds);
    setSelectedInstruments(filters.instrumentIds);
    setSelectedElements(filters.elementIds);
    setSelectedInstrumentRequests(filters.instrumentRequestIds);
    setSelectedElementRequests(filters.elementRequestIds);
    setExpandedTrackId(null); // Reset expanded track when filters change
  };

  // Enhanced track expansion handler with analytics
  const handleTrackExpansion = useCallback((trackId, allTracks) => {
    if (expandedTrackId !== trackId) {
      const track = allTracks?.find(t => t.id === trackId);
      if (track) {
        trackTrackExpand(trackId, track.title, track.username);
      }
    }
    setExpandedTrackId(prev => prev === trackId ? null : trackId);
  }, [expandedTrackId]);

  const renderTrack = useCallback((track, index, tracks) => {
    return (
      <Track
        track={track}
        allTracks={tracks}
        expandedTrackId={expandedTrackId}
        setExpandedTrackId={(trackId) => handleTrackExpansion(trackId, tracks)}
        homeFeedType={feedType}
      />
    );
  }, [expandedTrackId, handleTrackExpansion, feedType]);

  // Create tabs configuration
  const tabs = [
    // { key: 'for-you', label: 'For You' },
    ...(isAuthenticated ? [{ key: 'following', label: 'Following' }] : []),
    { key: 'popular', label: 'Popular' }
  ];

  const shouldShowSupportBetaCTA =
    !isMobile &&
    isAuthenticated &&
    !isLoading &&
    userPlan?.id === SUBSCRIPTION_TIERS.FREE;

  return (
    <div className={styles.feedContainer}>
      {/* Welcome Dialog for first-time visitors */}
      {showWelcomeDialog && (
        <div className="modal-overlay active" onClick={(e) => {
          if (e.target.className === 'modal-overlay active') {
            closeWelcomeDialog();
          }
        }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Welcome to sterio!</h2>
              <button 
                className="close-btn" 
                onClick={closeWelcomeDialog}
                aria-label="Close welcome dialog"
              >
                <FaTimes />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                <FaMusic style={{ fontSize: '48px', color: 'var(--primary-color)', marginBottom: '16px',  justifySelf: 'center'}} />
                <p style={{ fontSize: '16px', marginBottom: '24px' }}>
                  sterio is a social platform where musicians can collaborate with each other!
                </p>
                {isMobile && (
                  <p style={{ fontSize: '14px', marginBottom: '16px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                    💻 For the full experience, try using sterio on desktop!
                  </p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary, #f0f0f0)' }}>
                  <FaMicrophone style={{ fontSize: '32px', color: 'var(--primary-color)', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Create or Collaborate</h3>
                  <p style={{ fontSize: '14px', textAlign: 'center' }}>
                    Upload your own music tracks or add your sounds to existing tracks
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary, #f0f0f0)' }}>
                  <FaInfoCircle style={{ fontSize: '32px', color: 'var(--primary-color)', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>How It Works</h3>
                  <p style={{ fontSize: '14px', textAlign: 'center' }}>
                    Browse tracks, click on one to expand and see all collaborations
                  </p>
                </div>
              </div>
              
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  Ready to get started?
                </p>
                <p style={{ fontSize: '14px' }}>
                  Browse tracks below or upload your own to join the community!
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="pill-btn gradient-btn sm"
                onClick={closeWelcomeDialog}
              >
                Let&apos;s Go!
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className={styles.feedHeader}>
        <h1 className={styles.feedTitle}>Home Feed</h1>
        <p className={styles.feedSubtitle}>
          Check out the latest tracks from artists you follow and trending collaborations
        </p>
        
        <div className={styles.feedTabsContainer}>
          {feedType ? (
            <CustomTabs
              tabs={tabs}
              activeTab={feedType}
              onTabChange={handleFeedTypeChange}
              variant="feed"
            />
          ) : (
            <div className={styles.feedTabs}>
              <div className={styles.loadingTabs}>Loading...</div>
            </div>
          )}

          {feedType && (
            <TagFilter
              selectedGenres={selectedGenres}
              selectedInstruments={selectedInstruments}
              selectedElements={selectedElements}
              selectedInstrumentRequests={selectedInstrumentRequests}
              selectedElementRequests={selectedElementRequests}
              onChange={handleTagFilterChange}
            />
          )}
        </div>
      </div>

      {/* Mobile Banner - Show sponsored competition above feed on mobile */}
      {isMobile && hasSponsoredCompetition && (
        <SponsoredCompetition variant="banner" />
      )}
      
      {/* Desktop Layout - Feed with Sidebar */}
      <div className={styles.homeLayout}>
        <div className={styles.feedContent}>
          <div className={styles.feed}>
            {feedType ? (
              <InfiniteScrollContainer
                fetchData={fetchTracks}
                renderItem={renderTrack}
                emptyState={
                  <div className={styles.emptyFeed}>
                    <p>
                      {feedType === 'following' 
                        ? "You're not following any artists yet. Follow some artists to see their tracks here!"
                        : "No tracks available. Check back later or try a different feed type."}
                    </p>
                  </div>
                }
                errorState={(error) => (
                  <p className={styles.errorMessage}>{error}</p>
                )}
                className={styles.trackList}
                itemsPerPage={TRACKS_PER_PAGE}
                dependencies={[feedType, selectedGenres, selectedInstruments, selectedElements, selectedInstrumentRequests, selectedElementRequests]}
                resetOnDependenciesChange={true}
              />
            ) : (
              <div className={styles.emptyFeed}>
                <p>Loading feed...</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Desktop Sidebar - Show sponsored competition on desktop */}
        {!isMobile && (
          <div
            className={styles.sidebar}
            style={{ display: hasSponsoredCompetition || shouldShowSupportBetaCTA ? 'block' : 'none' }}
          >
            <SponsoredCompetition 
              variant="sidebar" 
              setHasSponsoredCompetition={setHasSponsoredCompetition}
            />
            {shouldShowSupportBetaCTA && <SupportBetaCTA flushTop={!hasSponsoredCompetition} />}
          </div>
        )}
      </div>
    </div>
  );
}