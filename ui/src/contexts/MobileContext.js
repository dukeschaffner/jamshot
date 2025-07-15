import { createContext, useState, useContext, useEffect } from 'react';

// Create the context with default values
const MobileContext = createContext({
  isMobile: false,
  isLoading: true,
});

// Custom hook to use the context
export const useMobile = () => useContext(MobileContext);

// Provider component
export function MobileProvider({ children }) {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      // Check for mobile devices using multiple methods
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
      const isMobileUserAgent = mobileKeywords.some(keyword => userAgent.includes(keyword));
      
      // Check screen size (tablets and phones)
      const isSmallScreen = window.innerWidth <= 768;
      
      // Check for touch capability
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      // Consider it mobile if any of these conditions are true
      const mobile = isMobileUserAgent || (isSmallScreen && isTouchDevice) || isSmallScreen;
      
      setIsMobile(mobile);
      setIsLoading(false);
    };

    // Check on mount
    checkMobile();

    // Check on resize
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <MobileContext.Provider value={{ isMobile, isLoading }}>
      {children}
    </MobileContext.Provider>
  );
} 