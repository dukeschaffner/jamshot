'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '../../lib/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import NotificationList from '../../components/NotificationList';
import styles from '../../components/Notifications.module.css';

export default function NotificationsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useUser();
  const { 
    notifications, 
    unreadCount, 
    loading, 
    error, 
    pagination,
    fetchNotifications, 
    loadMoreNotifications,
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotifications();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    // Fetch notifications on mount
    fetchNotifications();
    
    // Mark all as read when user visits the page
    if (unreadCount > 0) {
      markAllAsRead();
    }
  }, [isAuthenticated, fetchNotifications, markAllAsRead, unreadCount, router]);

  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className={styles.mobileNotificationsPage}>
      <div className={styles.mobileNotificationsHeader}>
        <h1>Notifications</h1>
      </div>

      <div className={styles.mobileNotificationsContent}>
        <NotificationList
          notifications={notifications}
          loading={loading}
          error={error}
          pagination={pagination}
          markAsRead={markAsRead}
          deleteNotification={deleteNotification}
          loadMoreNotifications={loadMoreNotifications}
          showLoadMore={true}
        />
      </div>
    </div>
  );
} 