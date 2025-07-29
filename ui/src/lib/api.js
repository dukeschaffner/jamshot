import Cookies from 'js-cookie';
import { createApiClient, createApiMethods } from '../../shared/index.js';

// Create web-specific API client
const apiClient = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  getToken: () => Cookies.get('accessToken'),
  setToken: (token) => Cookies.set('accessToken', token, { 
    expires: 1/24, // 1 hour in days
    sameSite: 'strict'
  }),
  removeToken: () => Cookies.remove('accessToken'),
  getRefreshToken: () => Cookies.get('refreshToken'),
  setRefreshToken: (token) => Cookies.set('refreshToken', token, { 
    expires: 7, // 7 days
    sameSite: 'strict'
  }),
  removeRefreshToken: () => Cookies.remove('refreshToken'),
  getCsrfToken: () => Cookies.get('csrfToken'),
  setCsrfToken: (token) => Cookies.set('csrfToken', token, { 
    expires: 1/24, // 1 hour in days
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  }),
  removeCsrfToken: () => Cookies.remove('csrfToken'),
  setAuthError: (message) => {
    // Store auth error for display in web app
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('authError', message);
    }
  },
  redirectToLogin: () => {
    // Navigate to login screen in web app
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
  refreshUserState: () => {
    // Trigger user state refresh in web app
    // This will be handled by the UserContext
    console.log('Refreshing user state...');
  },
  withCredentials: true, // Web uses cookies
});

// Create API methods using shared implementation
const {
  trackApi,
  userApi,
  authApi,
  searchApi,
  notificationApi,
  setRefreshUserState,
  getRefreshUserState,
} = createApiMethods(apiClient);



// Export API methods
export {
  trackApi,
  userApi,
  authApi,
  searchApi,
  notificationApi,
  setRefreshUserState,
  getRefreshUserState,
};

// Export the axios instance as default for backward compatibility
export default apiClient.api;