'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '../lib/NotificationContext';
import { FaBell, FaCheck, FaComment, FaHeart, FaMusic, FaRetweet, FaTrash, FaUserPlus, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';
import api from '../lib/api';
import TimeDisplay from './TimeDisplay';

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const router = useRouter();
  const { 
    notifications, 
    unreadCount, 
    loading, 
    error, 
    fetchNotifications, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotifications();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        // Mark all unread notifications as read before closing
        if (isOpen && unreadCount > 0) {
          markAllAsRead();
        }
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, unreadCount, markAllAsRead]);

  const handleNotificationClick = (notification) => {
    // Mark as read
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    // For follow requests, don't navigate
    if (notification.type === 'follow_request') {
      return;
    }
    
    // Navigate to the track
    router.push(`/track/${notification.related_track_id}`);
    setIsOpen(false);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'like':
        return <FaHeart className="text-red-500" />;
      case 'comment':
        return <FaComment className="text-blue-500" />;
      case 'new_version':
        return <FaMusic className="text-green-500" />;
      case 'repost':
        return <FaRetweet className="text-purple-500" />;
      case 'follow_request':
        return <FaUserPlus className="text-indigo-500" />;
      default:
        return <FaBell className="text-gray-500" />;
    }
  };

  const getNotificationText = (notification) => {
    const { type, actor_username, track_title } = notification;
    
    switch (type) {
      case 'like':
        return `${actor_username} liked your track "${track_title}"`;
      case 'comment':
        return `${actor_username} commented on your track "${track_title}"`;
      case 'new_version':
        return `${actor_username} created a new version of your track "${track_title}"`;
      case 'repost':
        return `${actor_username} reposted your track "${track_title}"`;
      case 'follow_request':
        return `${actor_username} requested to follow you`;
      default:
        return `New activity on your track "${track_title}"`;
    }
  };

  const handleAcceptFollowRequest = async (notification) => {
    try {
      await api.post(`/users/follow-requests/${notification.follow_request_id}/accept`);
      // Remove the notification from the list
      deleteNotification(notification.id);
    } catch (err) {
      console.error('Failed to accept follow request:', err);
    }
  };

  const handleRejectFollowRequest = async (notification) => {
    try {
      await api.post(`/users/follow-requests/${notification.follow_request_id}/reject`);
      // Remove the notification from the list
      deleteNotification(notification.id);
    } catch (err) {
      console.error('Failed to reject follow request:', err);
    }
  };

  return (
    <div className="relative notification-dropdown" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            fetchNotifications();
          }
        }}
        className="notification-button"
        title="Notifications"
      >
        <div className="notification-icon-wrapper">
          <FaBell size={20} />
          {unreadCount > 0 && (
            <span className="notification-dot"></span>
          )}
        </div>
        Notifications
      </button>

      {isOpen && (
        <div className="notification-panel">
          <div className="notification-header">
            <h3>Notifications</h3>
            {/* {notifications.length > 0 && (
              <button
                onClick={markAllAsRead}
                className="mark-all-read"
                title="Mark all as read"
              >
                <FaCheck className="inline mr-1" /> Mark all read
              </button>
            )} */}
          </div>

          {loading ? (
            <div className="notification-loading">Loading...</div>
          ) : error ? (
            <div className="notification-error">{error}</div>
          ) : notifications.length === 0 ? (
            <div className="notification-empty">No notifications</div>
          ) : (
            <ul className="notification-list">
              {notifications.map(notification => (
                <li
                  key={notification.id}
                  className={`notification-item ${
                    !notification.is_read ? 'unread' : ''
                  }`}
                >
                  <div className="notification-icon-container">{getNotificationIcon(notification.type)}</div>
                  <div 
                    className="notification-content"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <p className="notification-text">{getNotificationText(notification)}</p>
                    <TimeDisplay timestamp={notification.created_at} />
                    
                    {notification.type === 'follow_request' && (
                      <div className="notification-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptFollowRequest(notification);
                          }}
                          className="accept-btn"
                        >
                          <FaCheckCircle className="mr-1" /> Accept
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejectFollowRequest(notification);
                          }}
                          className="reject-btn"
                        >
                          <FaTimesCircle className="mr-1" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                  {/* <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notification.id);
                    }}
                    className="delete-btn"
                    title="Delete notification"
                  >
                    <FaTrash />
                  </button> */}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
} 