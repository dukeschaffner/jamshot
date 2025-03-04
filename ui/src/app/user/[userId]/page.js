'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import Cookies from 'js-cookie';
import { FaCamera, FaTimes, FaCheck } from 'react-icons/fa';
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
        setEditForm({
          username: userResponse.data.username,
          bio: userResponse.data.bio || ''
        });
        setTracks(tracksResponse.data);
        setRepostedTracks(repostsResponse.data);
        setStats(statsResponse.data);
      } catch (err) {
        console.error('Failed to fetch user data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

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
        await api.post(`/users/follow/${userId}`);
        setStats(prev => ({ ...prev, isFollowing: true, followers: prev.followers + 1 }));
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

  if (loading) return <p>Loading...</p>;

  return (
    <div className="user-profile-page">
      <div className="profile-header">
        <div 
          className={`profile-image-container ${isOwnProfile ? 'editable' : ''}`}
          onClick={handleImageClick}
        >
          <img 
            src={userProfile?.profile_image_url || '/api/placeholder/200/200'} 
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
          {isEditing ? (
            <form onSubmit={handleEditSubmit} className="edit-form">
              <input
                type="text"
                value={editForm.username}
                onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Username"
                className="edit-input"
              />
              <textarea
                value={editForm.bio}
                onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Bio"
                className="edit-input"
              />
              <div className="edit-buttons">
                <button type="submit" className="save-btn">
                  <FaCheck /> Save
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsEditing(false)}
                  className="cancel-btn"
                >
                  <FaTimes /> Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="username">{userProfile?.username}</h1>
              <p className="bio">{userProfile?.bio || 'No bio yet'}</p>
              <div className="stats">
                <span>{stats.followers} followers</span>
                <span>{stats.following} following</span>
              </div>
              {isOwnProfile ? (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="edit-profile-btn"
                >
                  Edit Profile
                </button>
              ) : (
                <button 
                  onClick={handleFollow}
                  className={`follow-btn ${stats.isFollowing ? 'following' : ''}`}
                >
                  {stats.isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </>
          )}
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
    </div>
  );
}