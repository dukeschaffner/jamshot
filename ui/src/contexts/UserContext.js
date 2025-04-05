import { createContext, useState, useContext, useEffect } from 'react';
import Cookies from 'js-cookie';
import api, { setUserStateRefreshCallback } from '../lib/api';
import { useRouter } from 'next/navigation';

// Create the context with default values
const UserContext = createContext({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  refreshUser: () => {},
});

// Custom hook to use the context
export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Check if user is authenticated
  const isAuthenticated = !!user;

  // Function to fetch user data
  const fetchUserData = async () => {
    setIsLoading(true);
    try {
      const token = Cookies.get('accessToken');
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const response = await api.get('/users/me');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Login function
  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      
      // Store both tokens in cookies
      const { accessToken, refreshToken } = response.data;
      
      // Store access token with short expiry (1 hour)
      Cookies.set('accessToken', accessToken, { 
        expires: 1/24, // 1 hour in days
        sameSite: 'strict'
      });
      
      // Store refresh token with longer expiry (30 days)
      Cookies.set('refreshToken', refreshToken, { 
        expires: 30, 
        sameSite: 'strict'
      });

      // Fetch user data
      await fetchUserData();
      
      // Redirect to home page on successful login
      router.push('/');
      
      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.error || 'Login failed',
        isEmailNotVerified: err.response?.status === 403 && err.response?.data?.error === 'Email not verified'
      };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const refreshToken = Cookies.get('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear cookies and user state
      Cookies.remove('accessToken');
      Cookies.remove('refreshToken');
      setUser(null);
      router.push('/login');
    }
  };
  
  // Refresh user data
  const refreshUser = () => {
    fetchUserData();
  };

  // Register the callback with the API service
  useEffect(() => {
    setUserStateRefreshCallback(refreshUser);
    
    // Clean up when component unmounts
    return () => {
      setUserStateRefreshCallback(null);
    };
  }, []);

  // Fetch user data on first load
  useEffect(() => {
    fetchUserData();
  }, []);

  // Create the context value
  const value = {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refreshUser
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export default UserContext; 