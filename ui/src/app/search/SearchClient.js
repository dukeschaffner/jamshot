'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '../../lib/api';
import MiniTrack from '../../components/MiniTrack';
import CustomTabs from '../../components/CustomTabs';
import BetaSupporterBadge from '../../components/BetaSupporterBadge';
import { trackUserFollow, trackUserUnfollow, trackSearch } from '../../lib/analytics';
import { FaCheckCircle, FaSearch, FaMusic, FaUsers } from 'react-icons/fa';
import Cookies from 'js-cookie';
import Link from 'next/link';
import Image from 'next/image';
import { useUser } from '../../contexts/UserContext';
import { useMobile } from '../../contexts/MobileContext';
import styles from './SearchPage.module.css';

// Component that uses useSearchParams
function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams?.get('query') || '';
  const [searchResults, setSearchResults] = useState({ tracks: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { user: currentUser, isAuthenticated } = useUser();
  const { isMobile } = useMobile();
  
  useEffect(() => {    
    const fetchSearchResults = async () => {
      if (!query) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        const response = await api.get(`/search?query=${encodeURIComponent(query)}`);
        setSearchResults(response.data);
      } catch (error) {
        console.error('Error fetching search results:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSearchResults();
  }, [query]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      trackSearch(searchQuery.trim());
      router.push(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };
  
  const handleFollowToggle = async (userId, isFollowing, hasRequestedToFollow = false) => {
    if (!isAuthenticated) {
      // Handle unauthenticated user
      return;
    }

    // Prevent following yourself
    if (currentUser && userId === currentUser.id) {
      return;
    }

    try {
      const user = searchResults.users.find(u => u.id === userId);

      if (hasRequestedToFollow) {
        // Cancel follow request
        await api.delete(`/users/follow/username/${user.username}`);
        if (user) trackUserUnfollow(user.username);

        // Update state to remove requested status
        setSearchResults(prev => ({
          ...prev,
          users: prev.users.map(user =>
            user.id === userId ? { ...user, has_requested_to_follow: false } : user
          )
        }));
      } else if (isFollowing) {
        // Unfollow existing follow
        await api.delete(`/users/follow/username/${user.username}`);
        if (user) trackUserUnfollow(user.username);

        // Update state to remove following status
        setSearchResults(prev => ({
          ...prev,
          users: prev.users.map(user =>
            user.id === userId ? { ...user, is_following: false } : user
          )
        }));
      } else {
        // Follow or send request
        const response = await api.post(`/users/follow/username/${user.username}`);
        if (user) trackUserFollow(user.username);

        // Check if this was a follow request (private user)
        if (response.data.message === 'Follow request sent') {
          // Update state to show requested status
          setSearchResults(prev => ({
            ...prev,
            users: prev.users.map(user =>
              user.id === userId ? { ...user, has_requested_to_follow: true } : user
            )
          }));
          return;
        }

        // For direct follow (public user), update is_following
        setSearchResults(prev => ({
          ...prev,
          users: prev.users.map(user =>
            user.id === userId ? { ...user, is_following: true, has_requested_to_follow: false } : user
          )
        }));
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };
  
  const renderTracks = () => {
    if (searchResults.tracks.length === 0) {
      return <div className={styles.noResults}>No tracks found</div>;
    }
    
    return (
      <div className="tracks-list">
        {searchResults.tracks.map(track => (
          <MiniTrack key={track.id} track={track} />
        ))}
      </div>
    );
  };
  
  const renderUsers = () => {
    if (searchResults.users.length === 0) {
      return <div className={styles.noResults}>No users found</div>;
    }
    
    return (
      <div className="users-list">
        {searchResults.users.map(user => (
          <div key={user.id} className={styles.userCard}>
            <Image
              className="avatar mr-2"
              src={user?.profile_pic_url || '/avatar.svg'} 
              alt={user.username} 
              width={60} 
              height={60}
            />
            <div className="user-info">
              <div className="user-name d-flex">
                <Link href={`/user/${user.username}`}>
                  {user.name || user.username}
                </Link>
                {user.verified && (
                  <FaCheckCircle className="verified-icon" style={{ alignSelf: 'center' }} />
                )}
                {(user.is_supporter || user.isSupporter) && <BetaSupporterBadge variant="icon" />}
              </div>
              <div className="user-handle">
                @{user.username}
              </div>
              <div className={styles.userStats}>
                <span className={styles.statItem}>
                  <FaMusic className={styles.statIcon} />
                  <span className={styles.statValue}>{user.track_count || 0}</span>
                </span>
                <span className={styles.statItem}>
                  <FaUsers className={styles.statIcon} />
                  <span className={styles.statValue}>{user.follower_count || 0}</span>
                </span>
              </div>
            </div>
            <div className="user-actions">
              {/* Only show follow button if user is not the current user */}
              {currentUser && user.id !== currentUser.id && (
                <button
                  className={`follow-btn ${user.is_following ? 'following' : user.has_requested_to_follow ? 'requested' : ''}`}
                  onClick={() => handleFollowToggle(user.id, user.is_following, user.has_requested_to_follow)}
                >
                  {user.is_following ? 'Following' : user.has_requested_to_follow ? 'Requested' : 'Follow'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  const renderContent = () => {
    switch (activeTab) {
      case 'tracks':
        return renderTracks();
      case 'users':
        return renderUsers();
      default:
        return (
          <>
            {searchResults.tracks.length > 0 && (
              <div className="section">
                <h2 className="section-title">Tracks</h2>
                {renderTracks()}
              </div>
            )}
            
            {searchResults.users.length > 0 && (
              <div className="section">
                <h2 className="section-title">Users</h2>
                {renderUsers()}
              </div>
            )}
            
            {searchResults.tracks.length === 0 && searchResults.users.length === 0 && !loading && (
              <div className={styles.noResults}>
                No results found for &quot;{decodeURIComponent(query)}&quot;
              </div>
            )}
          </>
        );
    }
  };

  // Show search input on mobile when there's no query
  if (isMobile && !query) {
    return (
      <div className={styles.searchPage}>
        <div className={styles.searchHeader}>
          <h1 className={styles.searchTitle}>Search</h1>
          <div className="search-box">
            <form onSubmit={handleSearch}>
              <FaSearch className="search-icon" />
              <input 
                type="text" 
                placeholder="Search for artists, tracks..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </form>
          </div>
        </div>
      </div>
    );
  }
  
  // Create tabs configuration
  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'tracks', label: 'Tracks' },
    { key: 'users', label: 'Users' }
  ];

  return (
    <div className={styles.searchPage}>
      <div className={styles.searchHeader}>
        <h1 className={styles.searchTitle}>
          Search results for &quot;{decodeURIComponent(query)}&quot;
        </h1>
        <CustomTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
      
      <div className={styles.searchResults}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
}

// Main component with Suspense boundary
export default function SearchClient() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
} 