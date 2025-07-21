import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApiClient, createApiMethods } from '../../shared/api';

// Create mobile-specific API client
const api = createApiClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'https://jamshot-api.azurewebsites.net',
  getToken: () => AsyncStorage.getItem('accessToken'),
  setToken: (token) => AsyncStorage.setItem('accessToken', token),
  removeToken: () => AsyncStorage.removeItem('accessToken'),
  getRefreshToken: () => AsyncStorage.getItem('refreshToken'),
  setRefreshToken: (token) => AsyncStorage.setItem('refreshToken', token),
  removeRefreshToken: () => AsyncStorage.removeItem('refreshToken'),
  setAuthError: (message) => {
    // Store auth error for display in mobile app
    AsyncStorage.setItem('authError', message);
  },
  redirectToLogin: () => {
    // Navigate to login screen in mobile app
    // This will be handled by the navigation system
    console.log('Redirecting to login...');
  },
  refreshUserState: () => {
    // Trigger user state refresh in mobile app
    // This will be handled by the UserContext
    console.log('Refreshing user state...');
  },
  withCredentials: false, // Mobile doesn't use cookies
});

// Create API methods using shared implementation
const {
  trackApi,
  userApi,
  authApi,
  searchApi,
  notificationApi,
} = createApiMethods(api);

export {
  trackApi,
  userApi,
  authApi,
  searchApi,
  notificationApi,
};

export default api; 