import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userApi, authApi } from '../services/api';

const UserContext = createContext({});

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const login = async (email, password) => {
    try {
      const response = await authApi.login(email, password);
      const { accessToken, refreshToken } = response.data;
      
      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('refreshToken', refreshToken);
      
      await fetchUserData();
      setAuthError(null);
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      setAuthError(errorMessage);
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await authApi.register(userData);
      const { accessToken, refreshToken } = response.data;
      
      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('refreshToken', refreshToken);
      
      await fetchUserData();
      setAuthError(null);
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Registration failed';
      setAuthError(errorMessage);
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  };

  const logout = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (refreshToken) {
        await authApi.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
      setUser(null);
      setAuthError(null);
    }
  };

  const fetchUserData = async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        setUser(null);
        return;
      }

      const response = await userApi.getCurrentUser();
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data) => {
    try {
      const response = await userApi.updateProfile(data);
      setUser(response.data);
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Update failed';
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  };

  const updatePrivacy = async (isPrivate) => {
    try {
      const response = await userApi.updatePrivacy(isPrivate);
      setUser(prev => ({ ...prev, is_private: response.data.is_private }));
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Privacy update failed';
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  return (
    <UserContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      authError,
      login,
      register,
      logout,
      updateProfile,
      updatePrivacy,
      refreshUser: fetchUserData,
      clearAuthError
    }}>
      {children}
    </UserContext.Provider>
  );
}; 