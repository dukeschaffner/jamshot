'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaBell, FaComment, FaHeart, FaMusic, FaRetweet, FaUserPlus, FaCheckCircle, FaTimesCircle, FaTrophy, FaExclamationTriangle, FaFolderOpen } from 'react-icons/fa';
import api, { projectApi } from '../lib/api';
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
  showLoadMore = true,
}) {
  const router = useRouter();
  const [processedRequests, setProcessedRequests] = useState({});
  const [processingInviteId, setProcessingInviteId] = useState(null);

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    if (notification.type === 'follow_request' || notification.type === 'project_invite') {
      return;
    }

    if (notification.type === 'competition_winner') {
      router.push(`/competition/${notification.competition_id}`);
    } else if (notification.type === 'follow') {
      router.push(`/user/${notification.actor_username}`);
    } else if (notification.type === 'track_rejected') {
      router.push(`/track/${notification.track_guid}`);
    } else {
      router.push(`/track/${notification.track_guid}`);
    }
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
      case 'follow':
        return <FaUserPlus className="text-green-500" />;
      case 'competition_winner':
        return <FaTrophy className="text-yellow-500" />;
      case 'track_rejected':
        return <FaExclamationTriangle className="text-red-500" />;
      case 'project_invite':
        return <FaFolderOpen className="text-green-500" />;
      default:
        return <FaBell className="text-gray-500" />;
    }
  };

  const getNotificationText = (notification) => {
    const { type, actor_username, track_title, id, rejection_reason, project_name } = notification;
    const actor = actor_username || 'Someone';

    switch (type) {
      case 'like':
        return `${actor} liked your track "${track_title}"`;
      case 'comment':
        return `${actor} commented on your track "${track_title}"`;
      case 'new_version':
        return `${actor} created a new version of your track "${track_title}"`;
      case 'repost':
        return `${actor} reposted your track "${track_title}"`;
      case 'follow_request':
        const requestStatus = processedRequests[id];
        if (requestStatus === 'accepted') {
          return `${actor}'s follow request was accepted`;
        } else if (requestStatus === 'rejected') {
          return `${actor}'s follow request was rejected`;
        }
        return `${actor} requested to follow you`;
      case 'follow':
        return `${actor} started following you`;
      case 'competition_winner':
        return `🎉 You won a competition! Follow the instructions in the email to collect your prize.`;
      case 'track_rejected':
        return `Your track "${track_title}" was rejected by moderators${rejection_reason ? `: ${rejection_reason}` : ''}`;
      case 'project_invite':
        return `${actor} invited you to project "${project_name || 'a project'}"`;
      default:
        return `New activity on your track "${track_title}"`;
    }
  };

  const handleAcceptFollowRequest = async (notification) => {
    try {
      await api.post(`/users/follow-requests/${notification.follow_request_id}/accept`);
      setProcessedRequests(prev => ({
        ...prev,
        [notification.id]: 'accepted'
      }));
    } catch (err) {
      console.error('Failed to accept follow request:', err);
    }
  };

  const handleRejectFollowRequest = async (notification) => {
    try {
      await api.post(`/users/follow-requests/${notification.follow_request_id}/reject`);
      setProcessedRequests(prev => ({
        ...prev,
        [notification.id]: 'rejected'
      }));
    } catch (err) {
      console.error('Failed to reject follow request:', err);
    }
  };

  const handleAcceptProjectInvite = async (notification) => {
    if (!notification.project_invite_token) return;
    setProcessingInviteId(notification.id);
    try {
      const response = await projectApi.acceptInvite(notification.project_invite_token);
      await deleteNotification(notification.id);
      const guid = response.data?.projectGuid || notification.project_guid;
      if (guid) {
        router.push(`/projects/${guid}`);
      }
    } catch (err) {
      console.error('Failed to accept project invite:', err);
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDeclineProjectInvite = async (notification) => {
    if (!notification.project_invite_token) return;
    setProcessingInviteId(notification.id);
    try {
      await projectApi.declineInvite(notification.project_invite_token);
      await deleteNotification(notification.id);
    } catch (err) {
      console.error('Failed to decline project invite:', err);
    } finally {
      setProcessingInviteId(null);
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
              
              {notification.type === 'follow_request' && !processedRequests[notification.id] && (
                <div className={styles.notificationActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptFollowRequest(notification);
                    }}
                    className="pill-btn green-btn sm"
                  >
                    <FaCheckCircle className="mr-1" /> Accept
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRejectFollowRequest(notification);
                    }}
                    className="pill-btn pink-btn sm"
                  >
                    <FaTimesCircle className="mr-1" /> Reject
                  </button>
                </div>
              )}

              {notification.type === 'project_invite' && notification.project_invite_token && (
                <div className={styles.notificationActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptProjectInvite(notification);
                    }}
                    className="pill-btn green-btn sm"
                    disabled={processingInviteId === notification.id}
                  >
                    <FaCheckCircle className="mr-1" /> Accept
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeclineProjectInvite(notification);
                    }}
                    className="pill-btn pink-btn sm"
                    disabled={processingInviteId === notification.id}
                  >
                    <FaTimesCircle className="mr-1" /> Decline
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      
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
    </>
  );
}
