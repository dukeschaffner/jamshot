'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '../../lib/api';
import MiniTrack from '../../components/MiniTrack';
import { FaCheckCircle, FaUserPlus, FaUserCheck } from 'react-icons/fa';
import Cookies from 'js-cookie';
import Link from 'next/link';

export default function SearchPage() {
  const searchParams = useSearchParams(); // Get search params
  const query = searchParams.get('query') || '';
  const [searchResults, setSearchResults] = useState({ tracks: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  useEffect(() => {
    const token = Cookies.get('token');
    setIsLoggedIn(!!token);
    
    const fetchSearchResults = async () => {
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
      // Redirect to login or show login modal
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
          user.id === userId 
            ? { ...user, is_following: !isFollowing } 
            : user
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
      <div className="search-tracks">
        {searchResults.tracks.map(track => (
          <MiniTrack 
            key={track.id} 
            track={track} 
            relatedTracks={searchResults.tracks}
          />
        ))}
      </div>
    );
  };
  
  const renderUsers = () => {
    if (searchResults.users.length === 0) {
      return <div className="no-results">No users found</div>;
    }
    
    return (
      <div className="search-users">
        {searchResults.users.map(user => (
          <div key={user.id} className="user-card">
            <Link href={`/user/${user.id}`}>
              <div className="user-avatar">
                <img 
                  src={user.profile_pic_url || '/default-avatar.png'} 
                  alt={user.username} 
                  className="avatar-img"
                />
              </div>
            </Link>
            <div className="user-info">
              <Link href={`/user/${user.id}`}>
                <div className="user-name">
                  {user.username}
                  {user.verified && <FaCheckCircle className="verified-icon" />}
                </div>
              </Link>
              <div className="user-stats">
                {user.follower_count} followers
              </div>
              {user.bio && (
                <div className="user-bio">{user.bio}</div>
              )}
            </div>
            {isLoggedIn && (
              <div className="user-actions">
                <button 
                  className={`follow-btn ${user.is_following ? 'following' : ''}`}
                  onClick={() => handleFollowToggle(user.id, user.is_following)}
                >
                  {user.is_following ? (
                    <>
                      <FaUserCheck /> Following
                    </>
                  ) : (
                    <>
                      <FaUserPlus /> Follow
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  const renderContent = () => {
    if (loading) {
      return <div className="loading">Loading search results...</div>;
    }
    
    switch (activeTab) {
      case 'tracks':
        return renderTracks();
      case 'users':
        return renderUsers();
      default:
        return (
          <>
            {searchResults.tracks.length > 0 && (
              <div className="search-section">
                <h2 className="section-title">Tracks</h2>
                {renderTracks()}
                {searchResults.tracks.length > 5 && (
                  <button 
                    className="view-all-btn"
                    onClick={() => setActiveTab('tracks')}
                  >
                    View all tracks
                  </button>
                )}
              </div>
            )}
            
            {searchResults.users.length > 0 && (
              <div className="search-section">
                <h2 className="section-title">Users</h2>
                {renderUsers()}
                {searchResults.users.length > 5 && (
                  <button 
                    className="view-all-btn"
                    onClick={() => setActiveTab('users')}
                  >
                    View all users
                  </button>
                )}
              </div>
            )}
            
            {searchResults.tracks.length === 0 && searchResults.users.length === 0 && (
              <div className="no-results">
                No results found for "{decodeURIComponent(query)}"
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
          Search results for "{decodeURIComponent(query)}"
        </h1>
        <div className="search-tabs">
          <button 
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Results
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
        {renderContent()}
      </div>
    </div>
  );
} 