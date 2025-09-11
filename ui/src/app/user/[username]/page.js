'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import CustomTabs from '../../../components/CustomTabs';
import UserListModal from '../../../components/UserListModal';
import Cookies from 'js-cookie';
import { FaCamera, FaTimes, FaCheck, FaLock, FaLockOpen, FaChevronDown, FaUserPlus, FaUserCheck } from 'react-icons/fa';
import ImageCropper from '../../../components/ImageCropper';
import { useUser } from '../../../contexts/UserContext';
import styles from './UserPage.module.css';

export default function UserPage() {
  const { username } = useParams();
  const router = useRouter();
  const { user: currentUser, isAuthenticated, refreshUser } = useUser();
  const [tracks, setTracks] = useState([]);
  const [repostedTracks, setRepostedTracks] = useState([]);
  const [likedTracks, setLikedTracks] = useState([]);
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
  const [usernameError, setUsernameError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await api.get(`/users/by-username/${username}`);
        const userId = user.data.id;
        const tracks = await api.get(`/users/${userId}/tracks`);
        const reposts = await api.get(`/users/${userId}/reposts`);
        const liked = await api.get(`/users/${username}/liked`);
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
        setLikedTracks(liked.data);
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

  const handleOpenFollowersModal = () => {
    // Don't open modal if user is private, not current user, and current user is not following
    if (isPrivate && !isOwnProfile && !stats.isFollowing) {
      return;
    }
    
    setShowFollowersModal(true);
  };

  const handleOpenFollowingModal = () => {
    // Don't open modal if user is private, not current user, and current user is not following
    if (isPrivate && !isOwnProfile && !stats.isFollowing) {
      return;
    }
    
    setShowFollowingModal(true);
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
    setUsernameError('');
    // Validate username
    if (!/^\w+$/.test(editForm.username)) {
      setUsernameError('Username can only contain letters, numbers, and underscores.');
      return;
    }
    // Validate username length
    if (editForm.username.length > 20) {
      setUsernameError('Username must be 20 characters or less.');
      return;
    }
    // Validate name is provided
    if (!editForm.name || editForm.name.trim() === '') {
      alert('Full name is required');
      return;
    }
    // Validate name length
    if (editForm.name.length > 40) {
      alert('Name must be 40 characters or less.');
      return;
    }
    try {
      const response = await api.put('/users/me', editForm);
      setUserProfile(response.data);
      setIsEditing(false);
      
      // Refresh global user context to update navbar
      refreshUser();
      
      // If the username was changed, navigate to new URL
      if (response.data.username !== username) {
        router.push(`/user/${response.data.username}`);
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
      
      // Refresh global user context to update navbar profile picture
      refreshUser();
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
      
      // Refresh global user context to update navbar
      refreshUser();
    } catch (err) {
      console.error('Failed to update privacy settings:', err);
      alert('Failed to update privacy settings');
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      alert('Please enter your password to confirm account deletion');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await api.delete('/users/me', { data: { password: deletePassword } });
      
      // Clear local storage and cookies
      localStorage.clear();
      Cookies.remove('token');
      Cookies.remove('refreshToken');
      
      // Redirect to home page
      router.push('/');
      
      alert('Your account has been successfully deleted');
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeletePassword('');
    }
  };

  // Create tabs configuration
  const tabs = [
    { key: 'tracks', label: 'Tracks' },
    { key: 'reposts', label: 'Reposts' },
    { key: 'liked', label: 'Liked' }
  ];

  if (loading) return <p>Loading...</p>;
  
  if (userNotFound) {
    return (
      <div className={styles.userNotFound}>
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
    <div className={styles.userProfilePage}>
      <div className={styles.profileHeader}>
        <div 
          className={`${styles.profileImageContainer} ${isOwnProfile ? styles.editable : ''}`}
          onClick={handleImageClick}
        >
          <img 
            src={userProfile?.profile_pic_url || '/avatar.svg'} 
            alt={`${userProfile?.username}'s profile`}
            className={styles.profileImage}
          />
          {isOwnProfile && (
            <div className={styles.imageOverlay}>
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

        <div className={styles.profileInfo}>
          <div className={styles.profileHeaderTop}>
            <h1 className={styles.profileUsername}>
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
              <div className={styles.profileActions}>
                {isEditing ? (
                  <div className={styles.editActions}>
                    <button className="cancel-btn" onClick={() => setIsEditing(false)}>
                      <FaTimes /> Cancel
                    </button>
                    <button className="save-btn" onClick={handleEditSubmit}>
                      <FaCheck /> Save
                    </button>
                    <button 
                      className="delete-account-btn" 
                      onClick={() => setShowDeleteModal(true)}
                      title="Delete Account"
                    >
                      Delete Account
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="pill-btn sm" onClick={() => setIsEditing(true)}>
                      Edit Profile
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
            <>
            <button 
              className={`pill-btn sm ${isPrivate ? 'private' : 'public'} w-min justify-self-start mb-2`}
              onClick={handlePrivacyToggle}
              title={isPrivate ? 'Make account public' : 'Make account private'}
            >
              {isPrivate ? <FaLock /> : <FaLockOpen />}
              {isPrivate ? 'Private' : 'Public'}
            </button>
              <form className={styles.editProfileForm} onSubmit={handleEditSubmit}>
                <div className={styles.formGroup}>
                  <label htmlFor="username">Username</label>
                  <input
                    type="text"
                    id="username"
                    value={editForm.username}
                    onChange={(e) => {
                      setEditForm({...editForm, username: e.target.value});
                      if (!/^\w*$/.test(e.target.value)) {
                        setUsernameError('Username can only contain letters, numbers, and underscores.');
                      } else if (e.target.value.length > 20) {
                        setUsernameError('Username must be 20 characters or less.');
                      } else {
                        setUsernameError('');
                      }
                    }}
                    className={styles.formControl}
                    required
                    maxLength={20}
                  />
                  {usernameError && <div className="input-error">{usernameError}</div>}
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="name">Full Name</label>
                  <input
                    type="text"
                    id="name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className={styles.formControl}
                    placeholder="Your full name"
                    required
                    maxLength={40}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="bio">Bio</label>
                  <textarea
                    id="bio"
                    value={editForm.bio}
                    onChange={(e) => setEditForm({...editForm, bio: e.target.value})}
                    className={styles.formControl}
                    rows="3"
                    maxLength="160"
                    placeholder="Tell people about yourself..."
                  />
                  <div className={styles.charCount}>{editForm.bio.length}/160</div>
                </div>
              </form>
          </>
          ) : (
            <p className={styles.bio}>{userProfile?.bio || 'No bio yet'}</p>
          )}
          {!isEditing && (
            <div className={styles.stats}>
              <span 
                className={`${styles.statItem} ${isPrivate && !isOwnProfile && !stats.isFollowing ? styles.disabled : ''}`} 
              onClick={handleOpenFollowersModal}
            >
              <span className={styles.statCount}>{stats.followers}</span> followers
            </span>
            <span 
              className={`${styles.statItem} ${isPrivate && !isOwnProfile && !stats.isFollowing ? styles.disabled : ''}`} 
              onClick={handleOpenFollowingModal}
            >
              <span className={styles.statCount}>{stats.following}</span> following
              </span>
            </div>
          )}
        </div>
      </div>

      <CustomTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Show tracks only if not a private account or if authorized */}
      {(!isPrivate || isOwnProfile || stats.isFollowing) ? (
        <div className={styles.tracksContainer}>
          {activeTab === 'tracks' ? (
            tracks.length > 0 ? (
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
              <div className={styles.emptyState}>
                <h3>No tracks yet</h3>
                <p>
                  {isOwnProfile 
                    ? "You haven't uploaded any tracks yet. Start creating to share your music with the world!"
                    : `${userProfile?.username} hasn't uploaded any tracks yet.`
                  }
                </p>
              </div>
            )
          ) : activeTab === 'reposts' ? (
            repostedTracks.length > 0 ? (
              repostedTracks.map(track => (
                <Track
                  key={track.id}
                  track={track}
                  allTracks={repostedTracks}
                  setExpandedTrackId={setExpandedTrackId}
                  expandedTrackId={expandedTrackId}
                />
              ))
            ) : (
              <div className={styles.emptyState}>
                <h3>No reposts yet</h3>
                <p>
                  {isOwnProfile 
                    ? "You haven't reposted any tracks yet. Discover and share tracks you love!"
                    : `${userProfile?.username} hasn't reposted any tracks yet.`
                  }
                </p>
              </div>
            )
          ) : (
            likedTracks.length > 0 ? (
              likedTracks.map(track => (
                <Track
                  key={track.id}
                  track={track}
                  allTracks={likedTracks}
                  setExpandedTrackId={setExpandedTrackId}
                  expandedTrackId={expandedTrackId}
                />
              ))
            ) : (
              <div className={styles.emptyState}>
                <h3>No liked tracks yet</h3>
                <p>
                  {isOwnProfile 
                    ? "You haven't liked any tracks yet. Explore and like tracks you enjoy!"
                    : `${userProfile?.username} hasn't liked any tracks yet.`
                  }
                </p>
              </div>
            )
          )}
        </div>
      ) : null}

      {/* Privacy notice for private accounts */}
      {isPrivate && !isOwnProfile && !stats.isFollowing && (
        <div className={styles.privacyNotice}>
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

      <UserListModal
        isOpen={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
        title="Followers"
        type="followers"
        userId={userProfile?.id}
      />

      <UserListModal
        isOpen={showFollowingModal}
        onClose={() => setShowFollowingModal(false)}
        title="Following"
        type="following"
        userId={userProfile?.id}
      />

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div 
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteModal(false);
              setDeletePassword('');
            }
          }}
        >
          <div className={styles.deleteModal}>
            <h2>Delete Account</h2>
            <p className={styles.warningText}>
              <strong>Warning:</strong> This action cannot be undone. All your tracks, comments, and account data will be permanently deleted.
            </p>
            <p className={styles.infoText}>
              Tracks with collaborations will be anonymized but preserved for other users.
            </p>
            <div className={styles.passwordInput}>
              <label htmlFor="deletePassword">Enter your password to confirm:</label>
              <input
                type="password"
                id="deletePassword"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                className={styles.formControl}
                autoComplete="current-password"
              />
            </div>
            <div className={styles.modalActions}>
              <button 
                className="cancel-btn" 
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className="delete-confirm-btn" 
                onClick={handleDeleteAccount}
                disabled={isDeleting || !deletePassword.trim()}
              >
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}