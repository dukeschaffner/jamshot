'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import Cookies from 'js-cookie';
import { FaCamera, FaTimes, FaCheck, FaLock, FaLockOpen, FaChevronDown, FaUserPlus, FaUserCheck } from 'react-icons/fa';
import ImageCropper from '../../../components/ImageCropper';
import { useUser } from '../../../contexts/UserContext';

export default function UserPage() {
  const { username } = useParams();
  const router = useRouter();
  const { user: currentUser, isAuthenticated } = useUser();
  const [tracks, setTracks] = useState([]);
  const [repostedTracks, setRepostedTracks] = useState([]);
  const [stats, setStats] = useState({ 
    followers: 0, 
    following: 0, 
    isFollowing: false,
    hasRequestedToFollow: false 
  });
  const [loading, setLoading] = useState(true);
  const [userNotFound, setUserNotFound] = useState(false);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [activeTab, setActiveTab] = useState('tracks');
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ 
    username: '', 
    name: '',
    bio: '' 
  });
  const [userProfile, setUserProfile] = useState(null);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [followerPage, setFollowerPage] = useState(1);
  const [followingPage, setFollowingPage] = useState(1);
  const [hasMoreFollowers, setHasMoreFollowers] = useState(false);
  const [hasMoreFollowing, setHasMoreFollowing] = useState(false);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const followersListRef = useRef(null);
  const followingListRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await api.get(`/users/by-username/${username}`);
        const userId = user.data.id;
        const tracks = await api.get(`/users/${userId}/tracks`);
        const reposts = await api.get(`/users/${userId}/reposts`);
        const stats = await api.get(`/users/${userId}/stats`);
        setUserProfile(user.data);
        setIsPrivate(user.data.is_private);
        setEditForm({
          username: user.data.username,
          name: user.data.name || '',
          bio: user.data.bio || ''
        });
        setTracks(tracks.data);
        setRepostedTracks(reposts.data);
        setStats(stats.data);
        setUserNotFound(false);
        
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        // Check if the error is because the user doesn't exist
        if (err.response && (err.response.status === 404 || err.response.data?.error === 'User not found')) {
          setUserNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [username]);

  useEffect(() => {
    setIsOwnProfile(isAuthenticated && currentUser?.id === userProfile?.id);
  }, [userProfile, currentUser, isAuthenticated]);

  const fetchFollowers = async (page = 1, append = false) => {
    if (loadingFollowers) return;
    
    try {
      setLoadingFollowers(true);
      const userId = userProfile.id;
      const response = await api.get(`/users/${userId}/followers?page=${page}&limit=20`);
      
      if (append) {
        setFollowersList(prev => [...prev, ...response.data.users]);
      } else {
        setFollowersList(response.data.users);
      }
      
      setHasMoreFollowers(response.data.hasMore);
      setFollowerPage(page);
    } catch (err) {
      console.error('Failed to fetch followers:', err);
    } finally {
      setLoadingFollowers(false);
    }
  };

  const fetchFollowing = async (page = 1, append = false) => {
    if (loadingFollowing) return;
    
    try {
      setLoadingFollowing(true);
      const userId = userProfile.id;
      const response = await api.get(`/users/${userId}/following?page=${page}&limit=20`);
      
      if (append) {
        setFollowingList(prev => [...prev, ...response.data.users]);
      } else {
        setFollowingList(response.data.users);
      }
      
      setHasMoreFollowing(response.data.hasMore);
      setFollowingPage(page);
    } catch (err) {
      console.error('Failed to fetch following:', err);
    } finally {
      setLoadingFollowing(false);
    }
  };

  const handleOpenFollowersModal = () => {
    // Don't open modal if user is private, not current user, and current user is not following
    if (isPrivate && !isOwnProfile && !stats.isFollowing) {
      return;
    }
    
    setFollowersList([]);
    setFollowerPage(1);
    setShowFollowersModal(true);
    fetchFollowers(1, false);
  };

  const handleOpenFollowingModal = () => {
    // Don't open modal if user is private, not current user, and current user is not following
    if (isPrivate && !isOwnProfile && !stats.isFollowing) {
      return;
    }
    
    setFollowingList([]);
    setFollowingPage(1);
    setShowFollowingModal(true);
    fetchFollowing(1, false);
  };

  const handleFollowersScroll = () => {
    if (!followersListRef.current || loadingFollowers || !hasMoreFollowers) return;
    
    const { scrollTop, scrollHeight, clientHeight } = followersListRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      fetchFollowers(followerPage + 1, true);
    }
  };

  const handleFollowingScroll = () => {
    if (!followingListRef.current || loadingFollowing || !hasMoreFollowing) return;
    
    const { scrollTop, scrollHeight, clientHeight } = followingListRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      fetchFollowing(followingPage + 1, true);
    }
  };

  const handleFollowUser = async (userId, username, isAlreadyFollowing) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    try {
      if (isAlreadyFollowing) {
        await api.delete(`/users/follow/${userId}`);
        
        // Update the follower and following lists
        setFollowersList(prev => 
          prev.map(user => 
            user.id === userId ? { ...user, is_following: false } : user
          )
        );
        
        setFollowingList(prev => 
          prev.map(user => 
            user.id === userId ? { ...user, is_following: false } : user
          )
        );
      } else {
        const response = await api.post(`/users/follow/${userId}`);
        
        // If the account is private, don't update is_following yet
        if (response.data.message === 'Follow request sent') {
          alert('Follow request sent. Waiting for approval.');
        } else {
          setFollowersList(prev => 
            prev.map(user => 
              user.id === userId ? { ...user, is_following: true } : user
            )
          );
          
          setFollowingList(prev => 
            prev.map(user => 
              user.id === userId ? { ...user, is_following: true } : user
            )
          );
        }
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err);
      alert('Failed to update follow status');
    }
  };

  const handleFollow = async () => {
    if (isOwnProfile) return; // Prevent following yourself
    
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    try {
      if (stats.isFollowing) {
        await api.delete(`/users/follow/username/${username}`);
        setStats(prev => ({ ...prev, isFollowing: false, followers: prev.followers - 1 }));
      } else if (stats.hasRequestedToFollow) {
        // If already requested, cancel the request by performing a delete
        await api.delete(`/users/follow/username/${username}`);
        setStats(prev => ({ ...prev, hasRequestedToFollow: false }));
      } else {
        const response = await api.post(`/users/follow/username/${username}`);
        // If the account is private, don't increment follower count yet
        if (response.data.message === 'Follow request sent') {
          setStats(prev => ({ ...prev, hasRequestedToFollow: true }));
        } else {
          setStats(prev => ({ ...prev, isFollowing: true, followers: prev.followers + 1 }));
        }
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err);
      alert('Failed to update follow status');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      // Validate name is provided
      if (!editForm.name || editForm.name.trim() === '') {
        alert('Full name is required');
        return;
      }
      
      const response = await api.put('/users/me', editForm);
      setUserProfile(response.data);
      setIsEditing(false);
      
      // If the username was changed, refresh the page
      if (response.data.username !== username) {
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      alert(err.response?.data?.error || 'Failed to update profile');
    }
  };

  const handleImageClick = () => {
    if (isOwnProfile) {
      fileInputRef.current?.click();
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target.result);
        setShowImageCropper(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = async (croppedImage, position) => {
    try {
      // Convert base64 to blob
      const response = await fetch(croppedImage);
      const blob = await response.blob();

      // Create form data
      const formData = new FormData();
      formData.append('image', blob, 'profile.jpg');
      formData.append('position', position);

      // Upload to server
      const uploadResponse = await api.post('/users/me/profile-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUserProfile(uploadResponse.data);
      setShowImageCropper(false);
      setSelectedImage(null);
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert('Failed to upload profile image');
    }
  };

  const handlePrivacyToggle = async () => {
    try {
      const response = await api.put('/users/me/privacy', { is_private: !isPrivate });
      setIsPrivate(response.data.is_private);
      alert(`Your account is now ${response.data.is_private ? 'private' : 'public'}`);
    } catch (err) {
      console.error('Failed to update privacy settings:', err);
      alert('Failed to update privacy settings');
    }
  };

  if (loading) return <p>Loading...</p>;
  
  if (userNotFound) {
    return (
      <div className="user-not-found">
        <h1>User Not Found</h1>
        <p>The user &quot;{username}&quot; does not exist.</p>
        <button 
          className="pill-btn"
          onClick={() => router.push('/')}
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      <div className="profile-header">
        <div 
          className={`profile-image-container ${isOwnProfile ? 'editable' : ''}`}
          onClick={handleImageClick}
        >
          <img 
            src={userProfile?.profile_pic_url || '/avatar.svg'} 
            alt={`${userProfile?.username}'s profile`}
            className="profile-image"
          />
          {isOwnProfile && (
            <div className="image-overlay">
              <FaCamera />
              <span>Update Photo</span>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />
        </div>

        <div className="profile-info">
          <div className="profile-header-top">
            <h1 className="profile-username">
              {!isEditing && (
                <>
                  {userProfile?.username}
                  {userProfile?.verified && (
                    <span className="verified-badge" title="Verified Artist">✓</span>
                  )}
                  {userProfile?.is_private && (
                    <span className="private-badge" title="Private Account">
                      <FaLock />
                    </span>
                  )}
                </>
              )}
            </h1>
            
            {isOwnProfile ? (
              <div className="profile-actions">
                {isEditing ? (
                  <div className="edit-actions">
                    <button className="cancel-btn" onClick={() => setIsEditing(false)}>
                      <FaTimes /> Cancel
                    </button>
                    <button className="save-btn" onClick={handleEditSubmit}>
                      <FaCheck /> Save
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="pill-btn" onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </button>
                    <button 
                      className={`pill-btn ${isPrivate ? 'private' : 'public'}`}
                      onClick={handlePrivacyToggle}
                      title={isPrivate ? 'Make account public' : 'Make account private'}
                    >
                      {isPrivate ? <FaLock /> : <FaLockOpen />}
                      {isPrivate ? 'Private' : 'Public'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button 
                className={`follow-btn ${stats.isFollowing ? 'following' : ''} ${stats.hasRequestedToFollow ? 'requested' : ''}`}
                onClick={handleFollow}
              >
                {stats.isFollowing ? 'Following' : stats.hasRequestedToFollow ? 'Requested' : 'Follow'}
              </button>
            )}
          </div>
          
          {!isEditing && userProfile?.name && (
            <h2 className="profile-name">{userProfile.name}</h2>
          )}
          
          {isEditing ? (
            <form className="edit-profile-form" onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  value={editForm.username}
                  onChange={(e) => setEditForm({...editForm, username: e.target.value})}
                  className="form-control"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  id="name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="form-control"
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="bio">Bio</label>
                <textarea
                  id="bio"
                  value={editForm.bio}
                  onChange={(e) => setEditForm({...editForm, bio: e.target.value})}
                  className="form-control"
                  rows="3"
                  maxLength="160"
                  placeholder="Tell people about yourself..."
                />
                <div className="char-count">{editForm.bio.length}/160</div>
              </div>
            </form>
          ) : (
            <p className="bio">{userProfile?.bio || 'No bio yet'}</p>
          )}
          <div className="stats">
            <span 
              className={`stat-item ${isPrivate && !isOwnProfile && !stats.isFollowing ? 'disabled' : ''}`} 
              onClick={handleOpenFollowersModal}
            >
              <span className="stat-count">{stats.followers}</span> followers
            </span>
            <span 
              className={`stat-item ${isPrivate && !isOwnProfile && !stats.isFollowing ? 'disabled' : ''}`} 
              onClick={handleOpenFollowingModal}
            >
              <span className="stat-count">{stats.following}</span> following
            </span>
          </div>
        </div>
      </div>

      <div className="custom-tabs">
        <button 
          className={`tab ${activeTab === 'tracks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracks')}
        >
          Tracks
        </button>
        <button 
          className={`tab ${activeTab === 'reposts' ? 'active' : ''}`}
          onClick={() => setActiveTab('reposts')}
        >
          Reposts
        </button>
      </div>

      {/* Show tracks only if not a private account or if authorized */}
      {(!isPrivate || isOwnProfile || stats.isFollowing) ? (
        <div className="tracks-container">
          {activeTab === 'tracks' ? (
            tracks.map(track => (
              <Track
                key={track.id}
                track={track}
                allTracks={tracks}
                setExpandedTrackId={setExpandedTrackId}
                expandedTrackId={expandedTrackId}
              />
            ))
          ) : (
            repostedTracks.map(track => (
              <Track
                key={track.id}
                track={track}
                allTracks={repostedTracks}
                setExpandedTrackId={setExpandedTrackId}
                expandedTrackId={expandedTrackId}
              />
            ))
          )}
        </div>
      ) : null}

      {/* Privacy notice for private accounts */}
      {isPrivate && !isOwnProfile && !stats.isFollowing && (
        <div className="privacy-notice">
          <FaLock className="privacy-notice-icon" />
          <h3>This Account is Private</h3>
          <p>Follow this account to see their tracks, followers, and following list.</p>
        </div>
      )}

      {showImageCropper && (
        <ImageCropper
          image={selectedImage}
          onSave={handleImageUpload}
          onCancel={() => {
            setShowImageCropper(false);
            setSelectedImage(null);
          }}
        />
      )}

      {/* Followers Modal */}
      {showFollowersModal && (
        <div 
          className="modal-overlay active"
          onClick={(e) => {
            if (e.target.className === 'modal-overlay active') {
              setShowFollowersModal(false);
            }
          }}
        >
          <div className="modal-content user-list-modal">
            <div className="modal-header">
              <h2 className="modal-title">Followers</h2>
              <button 
                className="close-btn"
                onClick={() => setShowFollowersModal(false)}
              >
                <FaTimes />
              </button>
            </div>
            <div 
              className="user-list-container"
              ref={followersListRef}
              onScroll={handleFollowersScroll}
            >
              {followersList.length > 0 ? (
                followersList.map(user => (
                  <div key={user.id} className="user-list-item">
                    <div className="user-list-info" onClick={() => router.push(`/user/${user.username}`)}>
                      <img 
                        src={user.profile_pic_url || '/avatar.svg'} 
                        alt={user.username}
                        className="user-avatar"
                      />
                      <div className="user-details">
                        <span className="username">
                          {user.username}
                          {user.verified && <span className="verified-badge">✓</span>}
                        </span>
                        {user.name && <span className="user-full-name">{user.name}</span>}
                      </div>
                    </div>
                    {user.id !== (userProfile?.id) && (
                      <button 
                        className={`follow-btn sm ${user.is_following ? 'following' : ''}`}
                        onClick={() => handleFollowUser(user.id, user.username, user.is_following)}
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
                    )}
                  </div>
                ))
              ) : (
                <div className="no-users-message">
                  {loadingFollowers ? 'Loading...' : 'No followers yet'}
                </div>
              )}
              {loadingFollowers && followersList.length > 0 && (
                <div className="loading-more">
                  Loading more...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Following Modal */}
      {showFollowingModal && (
        <div 
          className="modal-overlay active"
          onClick={(e) => {
            if (e.target.className === 'modal-overlay active') {
              setShowFollowingModal(false);
            }
          }}
        >
          <div className="modal-content user-list-modal">
            <div className="modal-header">
              <h2 className="modal-title">Following</h2>
              <button 
                className="close-btn"
                onClick={() => setShowFollowingModal(false)}
              >
                <FaTimes />
              </button>
            </div>
            <div 
              className="user-list-container"
              ref={followingListRef}
              onScroll={handleFollowingScroll}
            >
              {followingList.length > 0 ? (
                followingList.map(user => (
                  <div key={user.id} className="user-list-item">
                    <div className="user-list-info" onClick={() => router.push(`/user/${user.username}`)}>
                      <img 
                        src={user.profile_pic_url || '/avatar.svg'} 
                        alt={user.username}
                        className="user-avatar"
                      />
                      <div className="user-details">
                        <span className="username">
                          {user.username}
                          {user.verified && <span className="verified-badge">✓</span>}
                        </span>
                        {user.name && <span className="user-full-name">{user.name}</span>}
                      </div>
                    </div>
                    {user.id !== (userProfile?.id) && (
                      <button 
                        className={`follow-btn sm ${user.is_following ? 'following' : ''}`}
                        onClick={() => handleFollowUser(user.id, user.username, user.is_following)}
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
                    )}
                  </div>
                ))
              ) : (
                <div className="no-users-message">
                  {loadingFollowing ? 'Loading...' : 'Not following anyone yet'}
                </div>
              )}
              {loadingFollowing && followingList.length > 0 && (
                <div className="loading-more">
                  Loading more...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}