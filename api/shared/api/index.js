import axios from 'axios';

/**
 * Create a platform-agnostic API client
 * @param {Object} config - Configuration object
 * @param {string} config.baseURL - API base URL
 * @param {Function} config.getToken - Function to get access token
 * @param {Function} config.setToken - Function to set access token
 * @param {Function} config.removeToken - Function to remove access token
 * @param {Function} config.getRefreshToken - Function to get refresh token
 * @param {Function} config.setRefreshToken - Function to set refresh token
 * @param {Function} config.removeRefreshToken - Function to remove refresh token
 * @param {Function} config.getCsrfToken - Function to get CSRF token
 * @param {Function} config.setCsrfToken - Function to set CSRF token
 * @param {Function} config.removeCsrfToken - Function to remove CSRF token
 * @param {Function} config.setAuthError - Function to set auth error message
 * @param {Function} config.redirectToLogin - Function to redirect to login
 * @param {Function} config.refreshUserState - Function to refresh user state (can be updated later)
 * @param {boolean} config.withCredentials - Whether to send cookies with requests
 * @returns {Object} API client object with axios instance and callback management methods
 */
const createApiClient = (config = {}) => {
  const api = axios.create({
    baseURL: config.baseURL || process.env.API_URL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: config.withCredentials || false,
  });

  // Token management - platform specific implementation
  const getToken = config.getToken;
  const setToken = config.setToken;
  const removeToken = config.removeToken;
  const getRefreshToken = config.getRefreshToken;
  const setRefreshToken = config.setRefreshToken;
  const removeRefreshToken = config.removeRefreshToken;
  const getCsrfToken = config.getCsrfToken;
  const setCsrfToken = config.setCsrfToken;
  const removeCsrfToken = config.removeCsrfToken;
  const setAuthError = config.setAuthError;
  const redirectToLogin = config.redirectToLogin;
  
  // Mutable refreshUserState callback that can be updated after creation
  let refreshUserState = config.refreshUserState;

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

  // Request interceptor for authentication
  api.interceptors.request.use(async (requestConfig) => {
    if (getToken) {
      const token = await getToken();
      if (token) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    // Add CSRF token for state-changing requests
    if (getCsrfToken && ['post', 'put', 'delete', 'patch'].includes(requestConfig.method?.toLowerCase())) {
      const csrfToken = await getCsrfToken();
      if (csrfToken) {
        requestConfig.headers['X-CSRF-Token'] = csrfToken;
      }
    }
    
    return requestConfig;
  });

  // Response interceptor for token refresh
  api.interceptors.response.use(
    (response) => {
      // Store CSRF token from response headers if present
      const csrfToken = response.headers['x-csrf-token'];
      if (csrfToken && setCsrfToken) {
        setCsrfToken(csrfToken);
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
        if (removeCsrfToken) {
          await removeCsrfToken();
        }
        
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
      
      // Don't attempt token refresh for login attempts - let them handle their own 401 errors
      if (originalRequest.url?.includes('/auth/login')) {
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
        // Get refresh token
        const refreshToken = getRefreshToken ? await getRefreshToken() : null;
        
        if (!refreshToken) {
          // No refresh token, clear auth and redirect to login
          console.log('No refresh token, clearing auth and redirecting to login');
          if (removeToken) await removeToken();
          if (removeRefreshToken) await removeRefreshToken();
          if (setAuthError) setAuthError('Your session has expired. Please log in again.');
          
          // Update the UserContext if callback is set
          if (refreshUserState) {
            refreshUserState();
          }
          
          if (redirectToLogin) {
            redirectToLogin();
          }
          
          return Promise.reject(error);
        }
        
        // Try to get a new access token
        const response = await axios.post(
          `${config.baseURL || process.env.API_URL}/auth/refresh-token`,
          { refreshToken }
        );
        
        const { accessToken } = response.data;
        
        // Update the access token
        if (setToken) {
          await setToken(accessToken);
        }

        console.log('Access token refreshed');
        
        // Update the UserContext if callback is set
        if (refreshUserState) {
          refreshUserState();
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
        if (removeToken) await removeToken();
        if (removeRefreshToken) await removeRefreshToken();
        if (setAuthError) setAuthError('Your session has expired. Please log in again.');
        
        // Update the UserContext if callback is set
        if (refreshUserState) {
          refreshUserState();
        }
        
        if (redirectToLogin) {
          redirectToLogin();
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
  );

  // Create an object that includes the API instance and methods to manage callbacks
  const apiClient = {
    api,
    /**
     * Set the refresh user state callback function
     * @param {Function|null} callback - Function to call when user state should be refreshed, or null to remove
     */
    setRefreshUserState: (callback) => {
      refreshUserState = callback;
    },
    /**
     * Get the current refresh user state callback function
     * @returns {Function|null} Current callback function or null if not set
     */
    getRefreshUserState: () => refreshUserState,
  };

  return apiClient;
};

/**
 * Create API methods that work with any configured API client
 * @param {Object} apiClient - API client object from createApiClient
 * @returns {Object} API methods object
 */
const createApiMethods = (apiClient) => {
  // Extract the axios instance from the API client
  const api = apiClient.api;
  // Track API methods
  const trackApi = {
    getFeed: (type = 'for-you', page = 1) => 
      api.get(`/tracks/feed/${type}?page=${page}&limit=10`),
    
    getTrack: (id, secret = null) => {
      const url = secret ? `/tracks/${id}?secret=${secret}` : `/tracks/${id}`;
      return api.get(url);
    },
    
    likeTrack: (id) => api.post(`/tracks/${id}/like`),
    
    unlikeTrack: (id) => api.delete(`/tracks/${id}/like`),
    
    uploadTrack: (formData) => api.post('/tracks/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    
    getComments: (id, page = 1, limit = 10, parentId = null) => {
      let url = `/tracks/${id}/comments?page=${page}&limit=${limit}`;
      if (parentId) url += `&parent_id=${parentId}`;
      return api.get(url);
    },
    
    addComment: (id, content, parentCommentId = null) => 
      api.post(`/tracks/${id}/comment`, {
        content,
        parent_comment_id: parentCommentId
      }),
    
    updateComment: (commentId, content) => 
      api.put(`/tracks/comments/${commentId}`, { content }),
    
    deleteComment: (commentId) => 
      api.delete(`/tracks/comments/${commentId}`),
    
    refreshTrackUrl: (id, secret = null) => {
      let url = `/tracks/${id}/refresh-url`;
      if (secret) url += `?secret=${secret}`;
      return api.get(url);
    },
    
    updateTrackPrivacy: (id, isPrivate) => 
      api.put(`/tracks/${id}/privacy`, { is_private: isPrivate }),
    
    getUserTracks: (userId, page = 1, limit = 50) => 
      api.get(`/users/${userId}/tracks?page=${page}&limit=${limit}`),
  };

  // User API methods
  const userApi = {
    getProfile: (username) => api.get(`/users/${username}`),
    
    getCurrentUser: () => api.get('/users/me'),
    
    updateProfile: (data) => api.put('/users/me', data),
    
    updatePrivacy: (isPrivate) => api.put('/users/me/privacy', { is_private: isPrivate }),
    
    followUser: (id) => api.post(`/users/${id}/follow`),
    
    unfollowUser: (id) => api.delete(`/users/${id}/follow`),
    
    getFollowers: (username, page = 1) => 
      api.get(`/users/${username}/followers?page=${page}`),
    
    getFollowing: (username, page = 1) => 
      api.get(`/users/${username}/following?page=${page}`),

    deleteAccount: (password) => api.delete('/users/me', { data: { password } }),
  };

  // Auth API methods
  const authApi = {
    login: (email, password) => api.post('/auth/login', { email, password }),
    
    register: (userData) => api.post('/auth/register', userData),
    
    logout: () => api.post('/auth/logout'),
    
    refreshToken: (refreshToken) => api.post('/auth/refresh-token', { refreshToken }),
    
    forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
    
    resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
    
    verifyEmail: (token) => api.get(`/auth/verify-email/${token}`),
  };

  // Search API methods
  const searchApi = {
    searchTracks: (query, page = 1) => 
      api.get(`/search/tracks?q=${encodeURIComponent(query)}&page=${page}`),
    
    searchUsers: (query, page = 1) => 
      api.get(`/search/users?q=${encodeURIComponent(query)}&page=${page}`),
  };

  // Notifications API methods
  const notificationApi = {
    getNotifications: (page = 1) => 
      api.get(`/notifications?page=${page}`),
    
    markAsRead: (id) => api.put(`/notifications/${id}/read`),
    
    markAllAsRead: () => api.put('/notifications/read-all'),
  };

  // Competition API methods
  const competitionApi = {
    getCompetitions: (params = {}) => {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      return api.get(`/competitions?${queryParams.toString()}`);
    },

    getCompetition: (id) => api.get(`/competitions/${id}`),

    getCompetitionEntries: (id, page = 1, limit = 10) => 
      api.get(`/competitions/${id}/entries?page=${page}&limit=${limit}`),

    createCompetition: (data) => api.post('/competitions/create', data),

    updateCompetition: (id, data) => api.put(`/competitions/${id}`, data),

    deleteCompetition: (id) => api.delete(`/competitions/${id}`),
  };

  // Tag API methods
  const tagApi = {
    getGenres: () => api.get('/tags/genres'),

    getInstruments: () => api.get('/tags/instruments'),

    getTrackGenres: (trackId) => api.get(`/tags/track/${trackId}/genres`),

    getTrackInstruments: (trackId) => api.get(`/tags/track/${trackId}/instruments`),

    updateTrackGenres: (trackId, genreIds) => api.post(`/tags/track/${trackId}/genres`, { genreIds }),

    updateTrackInstruments: (trackId, instrumentIds) => api.post(`/tags/track/${trackId}/instruments`, { instrumentIds }),
  };

  return {
    trackApi,
    userApi,
    authApi,
    searchApi,
    notificationApi,
    competitionApi,
    tagApi,
    api, // Raw axios instance for custom requests
    // Callback management methods
    setRefreshUserState: apiClient.setRefreshUserState,
    getRefreshUserState: apiClient.getRefreshUserState,
  };
};

export { createApiClient, createApiMethods }; 