import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Enable cookies for CSRF
});

// Flag to prevent multiple refresh requests
let isRefreshing = false;
// Queue of failed requests to retry after token refresh
let failedQueue = [];
// Callback to update user state in the UserContext
let refreshUserStateCallback = null;

// Function to set the user state refresh callback
export const setUserStateRefreshCallback = (callback) => {
  refreshUserStateCallback = callback;
};

// Process the queue of failed requests
const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// Add JWT token and CSRF token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Add CSRF token for state-changing requests
  if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
    const csrfToken = Cookies.get('csrfToken');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  
  return config;
});

// Handle token expiration and other response errors
api.interceptors.response.use(
  (response) => {
    // Store CSRF token from response headers if present
    const csrfToken = response.headers['x-csrf-token'];
    if (csrfToken) {
      Cookies.set('csrfToken', csrfToken, { 
        expires: 1/24, // 1 hour in days
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production'
      });
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Handle CSRF token errors
    if (error.response?.status === 403 && 
        (error.response?.data?.code === 'CSRF_TOKEN_MISSING' || 
         error.response?.data?.code === 'CSRF_TOKEN_MISMATCH')) {
      
      // Clear CSRF token and retry the request
      Cookies.remove('csrfToken');
      
      // Don't retry if already retried
      if (!originalRequest._csrfRetry) {
        originalRequest._csrfRetry = true;
        return api(originalRequest);
      }
      
      return Promise.reject(error);
    }
    
    // If the error is not 401 or the request has already been retried, reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    
    // Mark this request as retried to prevent infinite loops
    originalRequest._retry = true;
    
    // If already refreshing, add to queue
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch(err => Promise.reject(err));
    }
    
    isRefreshing = true;
    
    try {
      // Get refresh token from cookies
      const refreshToken = Cookies.get('refreshToken');
      
      if (!refreshToken) {
        // No refresh token, clear auth and redirect to login
        console.log('No refresh token, clearing auth and redirecting to login');
        Cookies.remove('accessToken');
        Cookies.remove('refreshToken');
        sessionStorage.setItem('authError', 'Your session has expired. Please log in again.');
        
        // Update the UserContext if callback is set
        if (refreshUserStateCallback) {
          refreshUserStateCallback();
        }
        
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        
        return Promise.reject(error);
      }
      
      // Try to get a new access token
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh-token`,
        { refreshToken }
      );
      
      const { accessToken } = response.data;
      
      // Update the access token in cookies
      Cookies.set('accessToken', accessToken, { 
        expires: 1/24, // 1 hour in days
        sameSite: 'strict'
      });

      console.log('Access token refreshed');
      
      // Update the UserContext if callback is set
      if (refreshUserStateCallback) {
        refreshUserStateCallback();
      }
      
      // Update Authorization header for the original request
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      
      // Process any queued requests
      processQueue(null, accessToken);
      
      // Retry the original request
      return api(originalRequest);
    } catch (refreshError) {
      // Refresh token is invalid or expired
      processQueue(refreshError, null);
      
      // Clear auth and redirect to login
      console.log('Error refreshing token, clearing auth and redirecting to login');
      Cookies.remove('accessToken');
      Cookies.remove('refreshToken');
      sessionStorage.setItem('authError', 'Your session has expired. Please log in again.');
      
      // Update the UserContext if callback is set
      if (refreshUserStateCallback) {
        refreshUserStateCallback();
      }
      
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export const fetchTrack = async (trackId, secret) => {
  const url = secret 
    ? `/tracks/${trackId}?secret=${secret}`
    : `/tracks/${trackId}`;
  
  const response = await api.get(url);
  return response.data;
};

export const fetchComments = async (trackId, page = 1, limit = 10, parentId = null) => {
  let url = `/tracks/${trackId}/comments?page=${page}&limit=${limit}`;
  if (parentId) url += `&parent_id=${parentId}`;
  
  const response = await api.get(url);
  return response.data;
};

export const addComment = async (trackId, content, parentCommentId = null) => {
  const response = await api.post(`/tracks/${trackId}/comment`, {
    content,
    parent_comment_id: parentCommentId
  });
  return response.data;
};

export const updateComment = async (commentId, content) => {
  const response = await api.put(`/tracks/comments/${commentId}`, { content });
  return response.data;
};

export const deleteComment = async (commentId) => {
  const response = await api.delete(`/tracks/comments/${commentId}`);
  return response.data;
};

export const refreshTrackUrl = async (trackId, secret = null) => {
  let url = `/tracks/${trackId}/refresh-url`;
  if (secret) {
    url += `?secret=${secret}`;
  }
  const response = await api.get(url);
  return response.data;
};

export default api;