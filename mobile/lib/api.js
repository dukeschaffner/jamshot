import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApiClient, createApiMethods } from '../shared/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

// Token storage functions for React Native
const getToken = async () => {
  try {
    return await AsyncStorage.getItem('accessToken');
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
};

const setToken = async (token) => {
  try {
    if (token) {
      await AsyncStorage.setItem('accessToken', token);
    } else {
      await AsyncStorage.removeItem('accessToken');
    }
  } catch (error) {
    console.error('Error setting token:', error);
  }
};

const removeToken = async () => {
  try {
    await AsyncStorage.removeItem('accessToken');
  } catch (error) {
    console.error('Error removing token:', error);
  }
};

const getRefreshToken = async () => {
  try {
    return await AsyncStorage.getItem('refreshToken');
  } catch (error) {
    console.error('Error getting refresh token:', error);
    return null;
  }
};

const setRefreshToken = async (token) => {
  try {
    if (token) {
      await AsyncStorage.setItem('refreshToken', token);
    } else {
      await AsyncStorage.removeItem('refreshToken');
    }
  } catch (error) {
    console.error('Error setting refresh token:', error);
  }
};

const removeRefreshToken = async () => {
  try {
    await AsyncStorage.removeItem('refreshToken');
  } catch (error) {
    console.error('Error removing refresh token:', error);
  }
};

const getCsrfToken = async () => {
  try {
    return await AsyncStorage.getItem('csrfToken');
  } catch (error) {
    console.error('Error getting CSRF token:', error);
    return null;
  }
};

const setCsrfToken = async (token) => {
  try {
    if (token) {
      await AsyncStorage.setItem('csrfToken', token);
    } else {
      await AsyncStorage.removeItem('csrfToken');
    }
  } catch (error) {
    console.error('Error setting CSRF token:', error);
  }
};

const removeCsrfToken = async () => {
  try {
    await AsyncStorage.removeItem('csrfToken');
  } catch (error) {
    console.error('Error removing CSRF token:', error);
  }
};

const setAuthError = (message) => {
  // TODO: Implement toast/alert system
  console.error('Auth error:', message);
};

const redirectToLogin = () => {
  // TODO: Implement navigation to login screen
  console.log('Redirect to login');
};

const refreshUserState = () => {
  // TODO: Implement user state refresh
  console.log('Refresh user state');
};

// Create API client with React Native-specific configuration
const apiClient = createApiClient({
  baseURL: API_URL,
  getToken,
  setToken,
  removeToken,
  getRefreshToken,
  setRefreshToken,
  removeRefreshToken,
  getCsrfToken,
  setCsrfToken,
  removeCsrfToken,
  setAuthError,
  redirectToLogin,
  refreshUserState,
  withCredentials: false, // React Native doesn't use cookies
});

// Create API methods
const apiMethods = createApiMethods(apiClient);

// Export a hook for using the API
export function useApi() {
  return apiMethods.api;
}

// Export all API methods
export default apiMethods;

