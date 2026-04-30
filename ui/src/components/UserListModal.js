'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { FaTimes, FaUserPlus, FaUserCheck } from 'react-icons/fa';
import api from '../lib/api';
import { useUser } from '../contexts/UserContext';
import Image from 'next/image';
import BetaSupporterBadge from './BetaSupporterBadge';

export default function UserListModal({ 
  isOpen, 
  onClose, 
  title, 
  type, // 'followers', 'following', or 'likes'
  userId, // For followers/following
  trackId, // For likes
  initialUsers = []
}) {
  const router = useRouter();
  const { user: currentUser, isAuthenticated } = useUser();
  const [users, setUsers] = useState(initialUsers);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // Reset state when modal opens/closes or props change
  useEffect(() => {
    if (isOpen) {
      setUsers(initialUsers);
      setPage(1);
      setHasMore(false);
      if (initialUsers.length === 0) {
        fetchUsers(1, false);
      }
    }
  }, [isOpen, type, userId, trackId]);

  const fetchUsers = async (pageNum = 1, append = false) => {
    if (loading) return;
    
    try {
      setLoading(true);
      let response;
      
      if (type === 'followers') {
        response = await api.get(`/users/${userId}/followers?page=${pageNum}&limit=20`);
      } else if (type === 'following') {
        response = await api.get(`/users/${userId}/following?page=${pageNum}&limit=20`);
      } else if (type === 'likes') {
        response = await api.get(`/tracks/${trackId}/likes?page=${pageNum}&limit=20`);
      }
      
      if (append) {
        setUsers(prev => [...prev, ...response.data.users]);
      } else {
        setUsers(response.data.users);
      }
      
      setHasMore(response.data.pagination?.hasMore || false);
      setPage(pageNum);
    } catch (err) {
      console.error(`Failed to fetch ${type}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = () => {
    if (!listRef.current || loading || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      fetchUsers(page + 1, true);
    }
  };

  const handleFollowUser = async (targetUserId, username, isAlreadyFollowing) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    // Prevent following yourself
    if (currentUser && targetUserId === currentUser.id) {
      return;
    }
    
    try {
      if (isAlreadyFollowing) {
        await api.delete(`/users/follow/${targetUserId}`);
        
        // Update the user list
        setUsers(prev => 
          prev.map(user => 
            user.id === targetUserId ? { ...user, is_following: false } : user
          )
        );
      } else {
        const response = await api.post(`/users/follow/${targetUserId}`);
        
        // If the account is private, don't update is_following yet
        if (response.data.message === 'Follow request sent') {
          alert('Follow request sent. Waiting for approval.');
        } else {
          setUsers(prev => 
            prev.map(user => 
              user.id === targetUserId ? { ...user, is_following: true } : user
            )
          );
        }
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err);
      alert('Failed to update follow status');
    }
  };

  const handleUserClick = (username) => {
    router.push(`/user/${username}`);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target.className === 'modal-overlay active') {
          onClose();
        }
      }}
    >
      <div className="modal-content user-list-modal">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button 
            className="close-btn"
            onClick={onClose}
          >
            <FaTimes />
          </button>
        </div>
        <div 
          className="user-list-container"
          ref={listRef}
          onScroll={handleScroll}
        >
          {users.length > 0 ? (
            users.map(user => (
              <div key={user.id} className="user-list-item">
                <div className="user-list-info" onClick={() => handleUserClick(user.username)}>
                  <Image 
                    className="avatar"
                    src={user?.profile_pic_url || '/avatar.svg'} 
                    alt={user.username}
                    width={40}
                    height={40} 
                  />
                  <div className="user-details">
                    <span className="username">
                      {user.username}
                      {user.verified && <span className="verified-badge">✓</span>}
                      {(user.is_supporter || user.isSupporter) && <BetaSupporterBadge />}
                    </span>
                    {user.name && <span className="user-full-name">{user.name}</span>}
                  </div>
                </div>
                {user.id !== currentUser?.id && (
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
              {loading ? 'Loading...' : 
                type === 'followers' ? 'No followers yet' :
                type === 'following' ? 'Not following anyone yet' :
                'No likes yet'
              }
            </div>
          )}
          {loading && users.length > 0 && (
            <div className="loading-more">
              Loading more...
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
} 