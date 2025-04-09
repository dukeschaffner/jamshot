'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '../../lib/api';
import MiniTrack from '../../components/MiniTrack';
import { FaCheckCircle, FaUserPlus, FaUserCheck } from 'react-icons/fa';
import Cookies from 'js-cookie';
import Link from 'next/link';
import Image from 'next/image';

// Component that uses useSearchParams
function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams?.get('query') || '';
  const [searchResults, setSearchResults] = useState({ tracks: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  useEffect(() => {
    const token = Cookies.get('token');
    setIsLoggedIn(!!token);
    
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
  
  const handleFollowToggle = async (userId, isFollowing) => {
    if (!isLoggedIn) {
      // Handle unauthenticated user
      return;
    }
    
    try {
      if (isFollowing) {
        await api.delete(`/users/${userId}/follow`);
      } else {
        await api.post(`/users/${userId}/follow`);
      }
      
      // Update the user in the search results
      setSearchResults(prev => ({
        ...prev,
        users: prev.users.map(user => 
          user.id === userId ? { ...user, is_following: !isFollowing } : user
        )
      }));
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };
  
  const renderTracks = () => {
    if (searchResults.tracks.length === 0) {
      return <div className="no-results">No tracks found</div>;
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
      return <div className="no-results">No users found</div>;
    }
    
    return (
      <div className="users-list">
        {searchResults.users.map(user => (
          <div key={user.id} className="user-card">
            <div className="user-avatar">
              {user.profile_pic_url ? (
                <Image 
                  src={user.profile_pic_url} 
                  alt={user.username} 
                  width={50} 
                  height={50}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div className="avatar-placeholder"></div>
              )}
            </div>
            <div className="user-info">
              <div className="user-name">
                <Link href={`/user/${user.id}`}>
                  {user.username}
                </Link>
                {user.is_verified && (
                  <FaCheckCircle className="verified-icon" />
                )}
              </div>
              <div className="user-stats">
                <span>{user.track_count || 0} tracks</span>
                <span>{user.follower_count || 0} followers</span>
              </div>
            </div>
            <div className="user-actions">
              <button 
                className={`follow-btn ${user.is_following ? 'following' : ''}`}
                onClick={() => handleFollowToggle(user.id, user.is_following)}
              >
                {user.is_following ? (
                  <>
                    <FaUserCheck />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <FaUserPlus />
                    <span>Follow</span>
                  </>
                )}
              </button>
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
              <div className="no-results">
                No results found for &quot;{decodeURIComponent(query)}&quot;
              </div>
            )}
          </>
        );
    }
  };
  
  return (
    <div className="search-page">
      <div className="search-header">
        <h1 className="search-title">
          Search results for &quot;{decodeURIComponent(query)}&quot;
        </h1>
        <div className="search-tabs">
          <button 
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button 
            className={`tab-btn ${activeTab === 'tracks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracks')}
          >
            Tracks
          </button>
          <button 
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
        </div>
      </div>
      
      <div className="search-results">
        {loading ? (
          <div className="loading">Loading...</div>
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