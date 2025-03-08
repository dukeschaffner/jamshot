'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import Cookies from 'js-cookie';
import { FaCamera, FaTimes, FaCheck, FaLock, FaLockOpen } from 'react-icons/fa';
import ImageCropper from '../../../components/ImageCropper';

export default function UserPage() {
  const { userId } = useParams();
  const router = useRouter();
  const [tracks, setTracks] = useState([]);
  const [repostedTracks, setRepostedTracks] = useState([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, isFollowing: false });
  const [loading, setLoading] = useState(true);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [activeTab, setActiveTab] = useState('tracks');
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', bio: '' });
  const [userProfile, setUserProfile] = useState(null);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pendingFollowRequests, setPendingFollowRequests] = useState([]);

  useEffect(() => {
    const token = Cookies.get('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsOwnProfile(payload.id === parseInt(userId));
      } catch (e) {
        console.error('Failed to parse token:', e);
      }
    }
  }, [userId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userResponse, tracksResponse, repostsResponse, statsResponse] = await Promise.all([
          api.get(`/users/${userId}`),
          api.get(`/users/${userId}/tracks`),
          api.get(`/users/${userId}/reposts`),
          api.get(`/users/${userId}/stats`),
        ]);
        setUserProfile(userResponse.data);
        setIsPrivate(userResponse.data.is_private);
        setEditForm({
          username: userResponse.data.username,
          bio: userResponse.data.bio || ''
        });
        setTracks(tracksResponse.data);
        setRepostedTracks(repostsResponse.data);
        setStats(statsResponse.data);

        // If this is the user's own profile, fetch pending follow requests
        if (isOwnProfile) {
          try {
            const requestsResponse = await api.get('/users/me/follow-requests');
            setPendingFollowRequests(requestsResponse.data);
          } catch (err) {
            console.error('Failed to fetch follow requests:', err);
          }
        }
      } catch (err) {
        console.error('Failed to fetch user data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId, isOwnProfile]);

  const handleFollow = async () => {
    if (isOwnProfile) return; // Prevent following yourself
    
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    try {
      if (stats.isFollowing) {
        await api.delete(`/users/follow/${userId}`);
        setStats(prev => ({ ...prev, isFollowing: false, followers: prev.followers - 1 }));
      } else {
        const response = await api.post(`/users/follow/${userId}`);
        // If the account is private, don't increment follower count yet
        if (response.data.message === 'Follow request sent') {
          alert('Follow request sent. Waiting for approval.');
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
      const response = await api.put('/users/me', editForm);
      setUserProfile(response.data);
      setIsEditing(false);
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

  const handleAcceptFollowRequest = async (requestId) => {
    try {
      await api.post(`/users/follow-requests/${requestId}/accept`);
      // Remove from pending requests and update follower count
      setPendingFollowRequests(prev => prev.filter(req => req.id !== requestId));
      setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
    } catch (err) {
      console.error('Failed to accept follow request:', err);
      alert('Failed to accept follow request');
    }
  };

  const handleRejectFollowRequest = async (requestId) => {
    try {
      await api.post(`/users/follow-requests/${requestId}/reject`);
      // Remove from pending requests
      setPendingFollowRequests(prev => prev.filter(req => req.id !== requestId));
    } catch (err) {
      console.error('Failed to reject follow request:', err);
      alert('Failed to reject follow request');
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="user-profile-page">
      <div className="profile-header">
        <div 
          className={`profile-image-container ${isOwnProfile ? 'editable' : ''}`}
          onClick={handleImageClick}
        >
          <img 
            src={userProfile?.profile_pic_url || '/api/placeholder/200/200'} 
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
              {userProfile?.username}
              {userProfile?.verified && (
                <span className="verified-badge" title="Verified Artist">✓</span>
              )}
              {userProfile?.is_private && (
                <span className="private-badge" title="Private Account">
                  <FaLock />
                </span>
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
                    <button className="edit-btn" onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </button>
                    <button 
                      className={`privacy-btn ${isPrivate ? 'private' : 'public'}`}
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
                className={`follow-btn ${stats.isFollowing ? 'following' : ''}`}
                onClick={handleFollow}
              >
                {stats.isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          
          <p className="bio">{userProfile?.bio || 'No bio yet'}</p>
          <div className="stats">
            <span>{stats.followers} followers</span>
            <span>{stats.following} following</span>
          </div>
        </div>
      </div>

      <div className="profile-tabs">
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

      {isOwnProfile && pendingFollowRequests.length > 0 && (
        <div className="follow-requests-section">
          <h3>Pending Follow Requests ({pendingFollowRequests.length})</h3>
          <div className="follow-requests-list">
            {pendingFollowRequests.map(request => (
              <div key={request.id} className="follow-request-item">
                <div className="user-info">
                  <img 
                    src={request.profile_pic_url || '/api/placeholder/50/50'} 
                    alt={request.username}
                    className="user-avatar"
                  />
                  <span className="username">
                    {request.username}
                    {request.verified && <span className="verified-badge">✓</span>}
                  </span>
                </div>
                <div className="request-actions">
                  <button 
                    className="accept-btn"
                    onClick={() => handleAcceptFollowRequest(request.id)}
                  >
                    <FaCheck /> Accept
                  </button>
                  <button 
                    className="reject-btn"
                    onClick={() => handleRejectFollowRequest(request.id)}
                  >
                    <FaTimes /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}