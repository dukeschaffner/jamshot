import { createContext, useState, useContext, useEffect } from 'react';
import Cookies from 'js-cookie';
import api, { authApi, setRefreshUserState } from '../lib/api';
import { useRouter } from 'next/navigation';
import { getUserPlan } from '../lib/subscriptionUtils';

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
  const [userPlan, setUserPlan] = useState(getUserPlan(null)); // Initialize with free plan
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
        setUserPlan(getUserPlan(null)); // Set to free plan instead of null
        setIsLoading(false);
        return;
      }

      const response = await api.get('/users/me');
      setUser(response.data);
      const plan = getUserPlan(response.data);
      setUserPlan(plan);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      setUser(null);
      setUserPlan(getUserPlan(null)); // Set to free plan instead of null
    } finally {
      setIsLoading(false);
    }
  };

  // Login function
  const login = async (email, password, redirectUrl = null) => {
    try {
      const response = await authApi.login(email, password);
      
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
      
      // Redirect to provided URL or home page on successful login
      const destination = redirectUrl || '/';
      router.push(destination);
      
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
      setUserPlan(getUserPlan(null)); // Set to free plan instead of null
      router.push('/login');
    }
  };
  
  // Refresh user data
  const refreshUser = () => {
    fetchUserData();
  };

  // Register the callback with the API service
  useEffect(() => {
    setRefreshUserState(refreshUser);
    
    // Clean up when component unmounts
    return () => {
      setRefreshUserState(null);
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
    userPlan,
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