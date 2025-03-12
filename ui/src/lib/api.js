import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Flag to prevent multiple refresh requests
let isRefreshing = false;
// Queue of failed requests to retry after token refresh
let failedQueue = [];

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

// Add JWT token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration and other response errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If the error is not 401 or the request has already been retried, reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    
    // Check if the error is due to an expired token
    if (error.response?.data?.code === 'TOKEN_EXPIRED') {
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
          Cookies.remove('accessToken');
          Cookies.remove('refreshToken');
          sessionStorage.setItem('authError', 'Your session has expired. Please log in again.');
          
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
        Cookies.remove('accessToken');
        Cookies.remove('refreshToken');
        sessionStorage.setItem('authError', 'Your session has expired. Please log in again.');
        
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    // For other 401 errors, clear auth and redirect
    if (error.response?.status === 401) {
      Cookies.remove('accessToken');
      Cookies.remove('refreshToken');
      sessionStorage.setItem('authError', 'Authentication failed. Please log in again.');
      
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export const fetchTrack = async (trackId, secret) => {
  const url = secret 
    ? `/tracks/${trackId}?secret=${secret}`
    : `/tracks/${trackId}`;
  
  const response = await api.get(url);
  return response.data;
};

// Helper function to handle logout
export const logout = async () => {
  try {
    const refreshToken = Cookies.get('refreshToken');
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear cookies regardless of API call success
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
  }
};

export default api;