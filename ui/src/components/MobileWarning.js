'use client';
import { useState } from 'react';
import { FaDesktop, FaTimes } from 'react-icons/fa';
import { useMobile } from '../contexts/MobileContext';

export default function MobileWarning() {
  const { isMobile } = useMobile();
  const [isVisible, setIsVisible] = useState(true);

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
              📱 <strong>Mobile support is coming soon!</strong> We&apos;re working hard to bring 
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