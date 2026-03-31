'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import ImageCropper from './ImageCropper';
import { useUser } from '../contexts/UserContext';
import { FaCamera, FaLock, FaLockOpen, FaTimes, FaCheck } from 'react-icons/fa';
import Cookies from 'js-cookie';
import styles from './EditProfile.module.css';

const SOCIAL_FIELDS = [
  { key: 'tiktok_url', label: 'TikTok', prefix: 'https://www.tiktok.com/', placeholder: '@yourhandle' },
  { key: 'youtube_url', label: 'YouTube', prefix: 'https://www.youtube.com/', placeholder: '@yourchannel' },
  { key: 'instagram_url', label: 'Instagram', prefix: 'https://www.instagram.com/', placeholder: 'yourhandle' },
  { key: 'facebook_url', label: 'Facebook', prefix: 'https://www.facebook.com/', placeholder: 'yourpage' },
  { key: 'x_url', label: 'X', prefix: 'https://x.com/', placeholder: 'yourhandle' }
];

const getSocialRoute = (fullUrl, prefix) => {
  if (!fullUrl) {
    return '';
  }

  if (fullUrl.startsWith(prefix)) {
    return fullUrl.slice(prefix.length);
  }

  return fullUrl.replace(/^https?:\/\/[^/]+\//i, '');
};

const getInitialSocialFormValues = (user) =>
  SOCIAL_FIELDS.reduce((acc, field) => {
    acc[field.key] = getSocialRoute(user?.[field.key] || '', field.prefix);
    return acc;
  }, {});

export default function EditProfile({ user }) {
  const router = useRouter();
  const { refreshUser } = useUser();
  const [editForm, setEditForm] = useState({
    username: user?.username || '',
    name: user?.name || '',
    bio: user?.bio || '',
    ...getInitialSocialFormValues(user)
  });
  const [isPrivate, setIsPrivate] = useState(user?.is_private || false);
  const [usernameError, setUsernameError] = useState('');
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);

  // Update form when user changes
  useEffect(() => {
    if (user) {
      setEditForm({
        username: user.username || '',
        name: user.name || '',
        bio: user.bio || '',
        ...getInitialSocialFormValues(user)
      });
      setIsPrivate(user.is_private || false);
    }
  }, [user]);

  const handleImageClick = () => {
    fileInputRef.current?.click();
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
      await api.post('/users/me/profile-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowImageCropper(false);
      setSelectedImage(null);
      
      // Refresh global user context to update navbar profile picture
      refreshUser();
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert('Failed to upload profile image');
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
      
      // Refresh global user context to update navbar
      refreshUser();
      
      // If the username was changed, navigate to new URL
      if (response.data.username !== user?.username) {
        router.push(`/user/${response.data.username}`);
      } else {
        // Show success message
        alert('Profile updated successfully!');
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      alert(err.response?.data?.error || 'Failed to update profile');
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
      await api.delete('/users/me', { data: { password: deletePassword } });
      
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

  return (
    <div className={styles.editProfile}>
      <h1 className={styles.title}>Edit Profile</h1>
      
      <div className={styles.profileImageSection}>
        <div 
          className={styles.profileImageContainer}
          onClick={handleImageClick}
        >
          <img 
            src={user?.profile_pic_url || '/avatar.svg'} 
            alt={`${user?.username}'s profile`}
            className={styles.profileImage}
          />
          <div className={styles.imageOverlay}>
            <FaCamera />
            <span>Update Photo</span>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />
        </div>
        <p className={styles.imageHint}>Click to change profile picture</p>
      </div>

      <form className={styles.editForm} onSubmit={handleEditSubmit}>
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
          {usernameError && <div className={styles.inputError}>{usernameError}</div>}
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

        <div className={styles.formGroup}>
          <label>Social Links</label>
          <div className={styles.socialFields}>
            {SOCIAL_FIELDS.map((field) => (
              <div key={field.key} className={styles.socialInputRow}>
                <span className={styles.socialPrefix}>{field.prefix}</span>
                <input
                  type="text"
                  value={editForm[field.key]}
                  onChange={(e) => setEditForm({ ...editForm, [field.key]: e.target.value })}
                  className={styles.formControl}
                  placeholder={field.placeholder}
                  aria-label={`${field.label} profile route`}
                />
              </div>
            ))}
          </div>
          <p className={styles.helpText}>Enter the part after the site URL, such as a handle or a deeper profile route.</p>
        </div>

        <div className={styles.formGroup}>
          <label>Account Privacy</label>
          <button 
            type="button"
            className={`pill-btn sm ${isPrivate ? 'private' : 'public'}`}
            onClick={handlePrivacyToggle}
            title={isPrivate ? 'Make account public' : 'Make account private'}
          >
            {isPrivate ? <FaLock /> : <FaLockOpen />}
            {isPrivate ? 'Private' : 'Public'}
          </button>
          <p className={styles.helpText}>
            {isPrivate 
              ? 'Your account is private. Only approved followers can see your tracks.'
              : 'Your account is public. Anyone can see your tracks.'}
          </p>
        </div>

        <div className={styles.formActions}>
          <button type="submit" className="pill-btn sm green-btn">
            <FaCheck /> Save Changes
          </button>
        </div>
      </form>

      <div className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Danger Zone</h2>
        <button 
          className="pill-btn sm pink-btn" 
          onClick={() => setShowDeleteModal(true)}
        >
          Delete Account
        </button>
        <p className={styles.dangerText}>
          Once you delete your account, there is no going back. Please be certain.
        </p>
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
                className="pill-btn sm pink-btn" 
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

