'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import CustomTabs from '../../../components/CustomTabs';
import UserListModal from '../../../components/UserListModal';
import LoadingSpinner from '../../../components/LoadingSpinner';
import BetaSupporterBadge from '../../../components/BetaSupporterBadge';
import {
  FaCamera,
  FaLock,
  FaChevronDown,
  FaUserPlus,
  FaUserCheck,
  FaTiktok,
  FaYoutube,
  FaInstagram,
  FaFacebook,
  FaTwitter
} from 'react-icons/fa';
import Link from 'next/link';
import ImageCropper from '../../../components/ImageCropper';
import { useUser } from '../../../contexts/UserContext';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import styles from './UserPage.module.css';

export default function UserPage() {
  const { username } = useParams();
  const router = useRouter();
  const { user: currentUser, isAuthenticated, refreshUser } = useUser();
  const { isFeatureEnabled } = useFeatureFlags();
  const [tracks, setTracks] = useState([]);
  const [repostedTracks, setRepostedTracks] = useState([]);
  const [likedTracks, setLikedTracks] = useState([]);
  const [tracksPage, setTracksPage] = useState(1);
  const [repostsPage, setRepostsPage] = useState(1);
  const [likedPage, setLikedPage] = useState(1);
  const [hasMoreTracks, setHasMoreTracks] = useState(true);
  const [hasMoreReposts, setHasMoreReposts] = useState(true);
  const [hasMoreLiked, setHasMoreLiked] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loadingReposts, setLoadingReposts] = useState(false);
  const [loadingLiked, setLoadingLiked] = useState(false);
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
  const tracksObserver = useRef();
  const repostsObserver = useRef();
  const likedObserver = useRef();
  const TRACKS_PER_PAGE = 20;
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);

  // Fetch tracks for a specific tab
  const fetchTracks = useCallback(async (pageNum, tabType) => {
    if (!userProfile) return;
    
    try {
      if (tabType === 'tracks') {
        setLoadingTracks(true);
      } else if (tabType === 'reposts') {
        setLoadingReposts(true);
      } else if (tabType === 'liked') {
        setLoadingLiked(true);
      }

      let response;
      if (tabType === 'tracks') {
        response = await api.get(`/users/${userProfile.id}/tracks`, {
          params: { page: pageNum, limit: TRACKS_PER_PAGE }
        });
      } else if (tabType === 'reposts') {
        response = await api.get(`/users/${userProfile.id}/reposts`, {
          params: { page: pageNum, limit: TRACKS_PER_PAGE }
        });
      } else if (tabType === 'liked') {
        response = await api.get(`/users/${username}/liked`, {
          params: { page: pageNum, limit: TRACKS_PER_PAGE }
        });
      }

      const newTracks = response.data.tracks || response.data || [];
      const pagination = response.data.pagination;
      
      if (pageNum === 1) {
        if (tabType === 'tracks') {
          setTracks(newTracks);
        } else if (tabType === 'reposts') {
          setRepostedTracks(newTracks);
        } else if (tabType === 'liked') {
          setLikedTracks(newTracks);
        }
      } else {
        if (tabType === 'tracks') {
          setTracks(prev => [...prev, ...newTracks]);
        } else if (tabType === 'reposts') {
          setRepostedTracks(prev => [...prev, ...newTracks]);
        } else if (tabType === 'liked') {
          setLikedTracks(prev => [...prev, ...newTracks]);
        }
      }

      const hasMore = pagination?.hasMore ?? (newTracks.length === TRACKS_PER_PAGE);
      if (tabType === 'tracks') {
        setHasMoreTracks(hasMore);
      } else if (tabType === 'reposts') {
        setHasMoreReposts(hasMore);
      } else if (tabType === 'liked') {
        setHasMoreLiked(hasMore);
      }
    } catch (err) {
      console.error(`Failed to fetch ${tabType}:`, err);
    } finally {
      if (tabType === 'tracks') {
        setLoadingTracks(false);
      } else if (tabType === 'reposts') {
        setLoadingReposts(false);
      } else if (tabType === 'liked') {
        setLoadingLiked(false);
      }
    }
  }, [userProfile, username, TRACKS_PER_PAGE]);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await api.get(`/users/by-username/${username}`);
        const userId = user.data.id;
        const stats = await api.get(`/users/${userId}/stats`);
        setUserProfile(user.data);
        setIsPrivate(user.data.is_private);
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

  // Fetch initial tracks when user profile is loaded
  useEffect(() => {
    if (userProfile) {
      setTracksPage(1);
      setRepostsPage(1);
      setLikedPage(1);
      setTracks([]);
      setRepostedTracks([]);
      setLikedTracks([]);
      fetchTracks(1, 'tracks');
      fetchTracks(1, 'reposts');
      fetchTracks(1, 'liked');
    }
  }, [userProfile, fetchTracks]);

  // Handle pagination for tracks
  useEffect(() => {
    if (tracksPage > 1 && userProfile) {
      fetchTracks(tracksPage, 'tracks');
    }
  }, [tracksPage, userProfile, fetchTracks]);

  // Handle pagination for reposts
  useEffect(() => {
    if (repostsPage > 1 && userProfile) {
      fetchTracks(repostsPage, 'reposts');
    }
  }, [repostsPage, userProfile, fetchTracks]);

  // Handle pagination for liked
  useEffect(() => {
    if (likedPage > 1 && userProfile) {
      fetchTracks(likedPage, 'liked');
    }
  }, [likedPage, userProfile, fetchTracks]);

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

  // Intersection Observer callbacks for infinite scroll
  const lastTrackElementRef = useCallback(node => {
    if (loadingTracks) return;
    if (tracksObserver.current) tracksObserver.current.disconnect();
    tracksObserver.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreTracks) {
        setTracksPage(prevPage => prevPage + 1);
      }
    });
    if (node) tracksObserver.current.observe(node);
  }, [loadingTracks, hasMoreTracks]);

  const lastRepostElementRef = useCallback(node => {
    if (loadingReposts) return;
    if (repostsObserver.current) repostsObserver.current.disconnect();
    repostsObserver.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreReposts) {
        setRepostsPage(prevPage => prevPage + 1);
      }
    });
    if (node) repostsObserver.current.observe(node);
  }, [loadingReposts, hasMoreReposts]);

  const lastLikedElementRef = useCallback(node => {
    if (loadingLiked) return;
    if (likedObserver.current) likedObserver.current.disconnect();
    likedObserver.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreLiked) {
        setLikedPage(prevPage => prevPage + 1);
      }
    });
    if (node) likedObserver.current.observe(node);
  }, [loadingLiked, hasMoreLiked]);

  // Reset pagination when tab changes
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setExpandedTrackId(null);
  };

  // Create tabs configuration
  const tabs = [
    { key: 'tracks', label: 'Tracks' },
    { key: 'reposts', label: 'Reposts' },
    { key: 'liked', label: 'Liked' }
  ];
  const socialLinks = [
    { key: 'tiktok_url', label: 'TikTok', href: userProfile?.tiktok_url, icon: FaTiktok },
    { key: 'youtube_url', label: 'YouTube', href: userProfile?.youtube_url, icon: FaYoutube },
    { key: 'instagram_url', label: 'Instagram', href: userProfile?.instagram_url, icon: FaInstagram },
    { key: 'facebook_url', label: 'Facebook', href: userProfile?.facebook_url, icon: FaFacebook },
    { key: 'x_url', label: 'X', href: userProfile?.x_url, icon: FaTwitter }
  ].filter((link) => link.href);

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
              {userProfile?.username}
              {userProfile?.verified && (
                <span className="verified-badge" title="Verified Artist">✓</span>
              )}
              {(userProfile?.is_supporter || userProfile?.isSupporter) && <BetaSupporterBadge variant='icon'/>}
              {userProfile?.is_private && (
                <span className="private-badge" title="Private Account">
                  <FaLock />
                </span>
              )}
            </h1>
            
            {isOwnProfile ? (
              <div className={styles.profileActions}>
                <Link href="/user/edit" className="pill-btn sm">
                  Edit Profile
                </Link>
                {isFeatureEnabled('subscriptions', false) && (
                  <button 
                    className="pill-btn sm gradient-btn" 
                    onClick={() => router.push(`/user/${username}/analytics`)}
                  >
                    📊 Analytics
                  </button>
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
          
          {userProfile?.name && (
            <h2 className="profile-name">{userProfile.name}</h2>
          )}
          
          <p className={styles.bio}>{userProfile?.bio || 'No bio yet'}</p>
          
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

          {socialLinks.length > 0 && (
            <div className={styles.socialLinks}>
              {socialLinks.map(({ key, label, href, icon: Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialLink}
                  aria-label={`${userProfile?.username}'s ${label}`}
                  title={label}
                >
                  <Icon />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <CustomTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Show tracks only if not a private account or if authorized */}
      {(!isPrivate || isOwnProfile || stats.isFollowing) ? (
        <div className={styles.tracksContainer}>
          {activeTab === 'tracks' ? (
            tracks.length > 0 ? (
              <>
                {tracks.map((track, index) => (
                  <div 
                    key={track.id}
                    ref={index === tracks.length - 1 ? lastTrackElementRef : null}
                  >
                    <Track
                      track={track}
                      allTracks={tracks}
                      setExpandedTrackId={setExpandedTrackId}
                      expandedTrackId={expandedTrackId}
                    />
                  </div>
                ))}
                {loadingTracks && <LoadingSpinner />}
              </>
            ) : !loadingTracks ? (
              <div className={styles.emptyState}>
                <h3>No tracks yet</h3>
                <p>
                  {isOwnProfile 
                    ? "You haven't uploaded any tracks yet. Start creating to share your music with the world!"
                    : `${userProfile?.username} hasn't uploaded any tracks yet.`
                  }
                </p>
              </div>
            ) : null
          ) : activeTab === 'reposts' ? (
            repostedTracks.length > 0 ? (
              <>
                {repostedTracks.map((track, index) => (
                  <div 
                    key={track.id}
                    ref={index === repostedTracks.length - 1 ? lastRepostElementRef : null}
                  >
                    <Track
                      track={track}
                      allTracks={repostedTracks}
                      setExpandedTrackId={setExpandedTrackId}
                      expandedTrackId={expandedTrackId}
                    />
                  </div>
                ))}
                {loadingReposts && <LoadingSpinner />}
              </>
            ) : !loadingReposts ? (
              <div className={styles.emptyState}>
                <h3>No reposts yet</h3>
                <p>
                  {isOwnProfile 
                    ? "You haven't reposted any tracks yet. Discover and share tracks you love!"
                    : `${userProfile?.username} hasn't reposted any tracks yet.`
                  }
                </p>
              </div>
            ) : null
          ) : activeTab === 'liked' ? (
            likedTracks.length > 0 ? (
              <>
                {likedTracks.map((track, index) => (
                  <div 
                    key={track.id}
                    ref={index === likedTracks.length - 1 ? lastLikedElementRef : null}
                  >
                    <Track
                      track={track}
                      allTracks={likedTracks}
                      setExpandedTrackId={setExpandedTrackId}
                      expandedTrackId={expandedTrackId}
                    />
                  </div>
                ))}
                {loadingLiked && <LoadingSpinner />}
              </>
            ) : !loadingLiked ? (
              <div className={styles.emptyState}>
                <h3>No liked tracks yet</h3>
                <p>
                  {isOwnProfile 
                    ? "You haven't liked any tracks yet. Explore and like tracks you enjoy!"
                    : `${userProfile?.username} hasn't liked any tracks yet.`
                  }
                </p>
              </div>
            ) : null
          ) : null}
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

    </div>
  );
}