import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../lib/auth-client';
import api, { setRefreshUserState } from '../lib/api';
import { getUserPlan } from '../lib/subscriptionUtils';

// Create the context with default values
const UserContext = createContext({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  needsToCompleteProfile: false,
  login: () => {},
  logout: () => {},
  refreshUser: () => {},
});

// Custom hook to use the context
export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
  const router = useRouter();
  
  // Use Better Auth's useSession hook for session management
  const { data: session, isPending, error, refetch } = authClient.useSession();
  
  // State for additional user data that might not be in the session
  const [additionalUserData, setAdditionalUserData] = useState(null);
  const [isFetchingUserData, setIsFetchingUserData] = useState(false);

  // Get user from session or additional data
  const user = useMemo(() => {
    // Only return user if profile is completed
    if (session?.profile_completed !== true) {
      return null;
    }
    
    // If we have additional user data, merge it with session user
    if (additionalUserData) {
      return { ...session?.user, ...additionalUserData };
    }
    return session?.user || null;
  }, [session?.user, additionalUserData]);

  // Check if user needs to complete profile
  const needsToCompleteProfile = useMemo(() => {
    return !!session?.user && session.profile_completed !== true;
  }, [session?.user, session?.profile_completed]);

  // Check if user is authenticated
  const isAuthenticated = !!user;

  // Calculate user plan based on user data
  const userPlan = useMemo(() => {
    return getUserPlan(user);
  }, [user]);

  // Loading state combines Better Auth loading and additional data fetching
  const isLoading = isPending || isFetchingUserData;

  // Function to fetch additional user data from /users/me endpoint
  // This might be needed if there are fields not included in the Better Auth session
  // Can be called with force=true to fetch even if session isn't set yet (e.g., right after login)
  const fetchAdditionalUserData = useCallback(async (force = false) => {
    if (!force && !session?.user) {
      setAdditionalUserData(null);
      return;
    }

    setIsFetchingUserData(true);
    try {
      const response = await api.get('/users/me');
      setAdditionalUserData(response.data);
    } catch (error) {
      console.error('Failed to fetch additional user data:', error);
      // Don't clear user data on error, keep session data
    } finally {
      setIsFetchingUserData(false);
    }
  }, [session?.user]);

  // Fetch additional user data when session becomes available
  useEffect(() => {
    if (session?.user && !additionalUserData) {
      fetchAdditionalUserData();
    } else if (!session?.user) {
      setAdditionalUserData(null);
    }
  }, [session?.user, additionalUserData, fetchAdditionalUserData]);

  // Login function using Better Auth
  const login = async (email, password, redirectUrl = null) => {
    try {
      const { data, error: signInError } = await authClient.signIn.email({
        email,
        password,
      });

      if (signInError) {
        return {
          success: false,
          error: signInError.message || 'Login failed',
          isEmailNotVerified: signInError.status === 403 || signInError.message?.includes('email not verified'),
        };
      }

      // Session will be automatically updated via useSession hook
      // Fetch additional user data immediately if we have user data from signIn
      // Use force=true since session might not be updated in the hook yet
      if (data?.user) {
        // Fetch additional user data in the background
        fetchAdditionalUserData(true).catch(err => {
          console.error('Failed to fetch additional user data after login:', err);
        });
      }

      // Redirect to provided URL or home page on successful login
      const destination = redirectUrl || '/';
      router.push(destination);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Login failed',
        isEmailNotVerified: err.status === 403 || err.message?.includes('email not verified'),
      };
    }
  };

  // Logout function using Better Auth
  const logout = async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            // Clear additional user data
            setAdditionalUserData(null);
            // Redirect to login page
            router.push('/login');
          },
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state and redirect
      setAdditionalUserData(null);
      router.push('/login');
    }
  };

  // Refresh user data
  const refreshUser = useCallback(async () => {
    // Force refresh session from database, bypassing cookie cache
    const freshSession = await authClient.getSession({
      query: {
        disableCookieCache: true, // Force fetch from database and refresh cookie cache
      },
    });
    
    // Refetch Better Auth session hook to update reactive state
    await refetch();
    
    // After session is updated, fetch additional user data if user exists
    if (freshSession?.data?.user) {
      await fetchAdditionalUserData(true);
    }
  }, [refetch, fetchAdditionalUserData]);

  // Register the callback with the API service
  useEffect(() => {
    setRefreshUserState(refreshUser);

    // Clean up when component unmounts
    return () => {
      setRefreshUserState(null);
    };
  }, [refreshUser]);

  // Create the context value
  const value = {
    user,
    isLoading,
    isAuthenticated,
    needsToCompleteProfile,
    userPlan,
    login,
    logout,
    refreshUser,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export default UserContext; 