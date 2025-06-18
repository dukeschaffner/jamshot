'use client';
import { useState, useEffect } from 'react';
import { FaDesktop, FaTimes } from 'react-icons/fa';

export default function MobileWarning() {
  const [isMobile, setIsMobile] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

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
    };

    // Check on mount
    checkMobile();

    // Check on resize
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Don't render if not mobile or if dismissed
  if (!isMobile || !isVisible) return null;

  return (
    <div className="mobile-warning-overlay">
      <div className="mobile-warning-modal">
        <div className="mobile-warning-header">
          <FaDesktop className="desktop-icon" />
          <h2>Desktop Experience Required</h2>
          <button 
            className="close-button"
            onClick={() => setIsVisible(false)}
            aria-label="Close warning"
          >
            <FaTimes />
          </button>
        </div>
        
        <div className="mobile-warning-content">
          <p>
            <strong>Sterio</strong> is currently optimized for desktop use only. 
            Our music creation and collaboration tools require a desktop environment 
            for the best experience.
          </p>
          
          <div className="mobile-warning-future">
            <p>
              📱 <strong>Mobile support is coming soon!</strong> We're working hard to bring 
              Sterio to mobile devices. Check back later for updates.
            </p>
          </div>
        </div>
        
        <div className="mobile-warning-actions">
          <button 
            className="continue-anyway-btn"
            onClick={() => setIsVisible(false)}
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
} 