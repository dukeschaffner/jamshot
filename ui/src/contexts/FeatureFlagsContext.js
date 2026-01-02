import { createContext, useState, useContext, useEffect } from 'react';
import api from '../lib/api';

// Create the context with default values
const FeatureFlagsContext = createContext({
  flags: {},
  isLoading: true,
  isFeatureEnabled: () => false,
  refreshFlags: () => {},
});

// Custom hook to use the context
export const useFeatureFlags = () => useContext(FeatureFlagsContext);

export const FeatureFlagsProvider = ({ children }) => {
  const [flags, setFlags] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Function to fetch feature flags
  const fetchFeatureFlags = async () => {
    try {
      const response = await api.get('/feature-flags');
      setFlags(response.data || {});
    } catch (error) {
      console.error('Failed to fetch feature flags:', error);
      // On error, set empty flags object (all features disabled by default)
      setFlags({});
    } finally {
      setIsLoading(false);
    }
  };

  // Function to check if a feature is enabled
  const isFeatureEnabled = (flagKey, defaultValue = false) => {
    if (flagKey in flags) {
      return flags[flagKey];
    }
    return defaultValue;
  };

  // Function to refresh flags
  const refreshFlags = () => {
    setIsLoading(true);
    fetchFeatureFlags();
  };

  // Fetch feature flags on mount
  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  // Create the context value
  const value = {
    flags,
    isLoading,
    isFeatureEnabled,
    refreshFlags,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};

export default FeatureFlagsContext;

