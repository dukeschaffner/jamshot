'use client';
import { useRouter } from 'next/navigation';
import { FaBell, FaComment, FaHeart, FaMusic, FaRetweet, FaUserPlus, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import api from '../lib/api';
import TimeDisplay from './TimeDisplay';
import styles from './Notifications.module.css';

export default function NotificationList({ 
  notifications,
  loading,
  error,
  pagination,
  markAsRead,
  deleteNotification,
  loadMoreNotifications,
  showLoadMore = true
}) {
  const router = useRouter();

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

  const handleLoadMore = () => {
    if (pagination && pagination.hasNextPage && !loading) {
      loadMoreNotifications();
    }
  };

  if (loading && notifications.length === 0) {
    return <div className={styles.notificationLoading}>Loading...</div>;
  }

  if (error) {
    return <div className={styles.notificationError}>{error}</div>;
  }

  if (notifications.length === 0) {
    return <div className={styles.notificationEmpty}>No notifications</div>;
  }

  return (
    <>
      <ul className={styles.notificationList}>
        {notifications.map(notification => (
          <li
            key={notification.id}
            className={`${styles.notificationItem} ${
              !notification.is_read ? 'unread' : ''
            }`}
          >
            <div className={styles.notificationIconContainer}>{getNotificationIcon(notification.type)}</div>
            <div 
              className={styles.notificationContent}
              onClick={() => handleNotificationClick(notification)}
            >
              <p className={styles.notificationText}>{getNotificationText(notification)}</p>
              <TimeDisplay timestamp={notification.created_at} />
              
              {notification.type === 'follow_request' && (
                <div className={styles.notificationActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptFollowRequest(notification);
                    }}
                    className={styles.acceptBtn}
                  >
                    <FaCheckCircle className="mr-1" /> Accept
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRejectFollowRequest(notification);
                    }}
                    className={styles.rejectBtn}
                  >
                    <FaTimesCircle className="mr-1" /> Reject
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      
      {/* Load More Button */}
      {showLoadMore && pagination && pagination.hasNextPage && (
        <div className="load-more-container">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="load-more-btn"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
      
      {/* Pagination Info */}
      {pagination && (
        <div className={styles.notificationLoading}>
          Showing {notifications.length} of {pagination.totalCount} notifications
        </div>
      )}
    </>
  );
} 