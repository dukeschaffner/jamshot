'use client';
import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../lib/NotificationContext';
import { FaBell } from 'react-icons/fa';
import NotificationList from './NotificationList';
import styles from './Notifications.module.css';

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { 
    notifications, 
    unreadCount, 
    loading, 
    error, 
    pagination,
    loadMoreNotifications,
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

  return (
    <div className="relative notification-dropdown" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="notification-button"
        title="Notifications"
      >
        <div className="notification-icon-wrapper">
          <FaBell size={20} />
          {unreadCount > 0 && (
            <span className={styles.notificationDot}></span>
          )}
        </div>
        Notifications
      </button>

      {isOpen && (
        <div className="notification-panel">
          <div className={styles.notificationHeader}>
            <h3>Notifications</h3>
          </div>

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
      )}
    </div>
  );
} 