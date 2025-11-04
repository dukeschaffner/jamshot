'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';
import { useUser } from '../contexts/UserContext';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);
  const { isAuthenticated, isLoading: userLoading } = useUser();

  const fetchNotifications = async (page = 1, limit = 20) => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setPagination(null);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await api.get(`/notifications?page=${page}&limit=${limit}`);
      
      // Handle both old and new response formats
      if (response.data.notifications) {
        // New paginated format
        setNotifications(response.data.notifications);
        setPagination(response.data.pagination);
        setUnreadCount(response.data.notifications.filter(n => !n.is_read).length);
      } else {
        // Old format (fallback)
        setNotifications(response.data);
        setPagination(null);
        setUnreadCount(response.data.filter(n => !n.is_read).length);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }

    // Prevent concurrent requests
    if (fetchUnreadCount.isFetching) {
      return;
    }

    fetchUnreadCount.isFetching = true;

    try {
      const response = await api.get('/notifications/count');
      setUnreadCount(response.data.count);
    } catch (err) {
      console.error('Failed to fetch notification count:', err);
      // Don't reset isFetching on error to prevent rapid retry loops
    } finally {
      // Reset after a short delay to allow natural polling intervals
      setTimeout(() => {
        fetchUnreadCount.isFetching = false;
      }, 5000); // Allow new requests after 5 seconds
    }
  };

  const markAsRead = async (notificationId) => {
    if (!isAuthenticated) return;
    
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!isAuthenticated) return;
    
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!isAuthenticated) return;
    
    try {
      await api.delete(`/notifications/${notificationId}`);
      const deleted = notifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (deleted && !deleted.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const loadMoreNotifications = async () => {
    if (!isAuthenticated || !pagination || !pagination.hasNextPage || loading) return;
    
    try {
      setLoading(true);
      const response = await api.get(`/notifications?page=${pagination.page + 1}&limit=${pagination.limit}`);
      
      if (response.data.notifications) {
        // Append new notifications to existing ones
        setNotifications(prev => [...prev, ...response.data.notifications]);
        setPagination(response.data.pagination);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to load more notifications:', err);
      setError('Failed to load more notifications');
    } finally {
      setLoading(false);
    }
  };

  // Fetch notifications when authentication state changes
  useEffect(() => {
    // Wait for user loading to complete before making decisions
    if (userLoading) return;

    if (isAuthenticated) {
      fetchNotifications();
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setPagination(null);
      setLoading(false);
    }
  }, [isAuthenticated]); // Only depend on authentication state, not loading state

  // Set up polling for unread count when authenticated
  useEffect(() => {
    if (!isAuthenticated || userLoading) return;

    let interval;
    let isVisible = true;

    const startPolling = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(fetchUnreadCount, 60000); // Poll every minute
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isVisible = false;
        stopPolling();
      } else {
        isVisible = true;
        startPolling();
      }
    };

    // Start polling initially
    startPolling();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [isAuthenticated]); // Only depend on authentication state

  return (
    <NotificationContext.Provider
      value={{
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
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
} 