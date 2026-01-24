'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import GuardedLink from './GuardedLink';
import { FaBars, FaInfoCircle, FaQuestionCircle, FaEnvelope, FaShieldAlt, FaGavel, FaTimes, FaSignOutAlt, FaCrown, FaNewspaper, FaCampground, FaUsers } from 'react-icons/fa';
import { useMobile } from '../contexts/MobileContext';
import { useUser } from '../contexts/UserContext';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import { useNavigationGuard } from '../contexts/NavigationGuardContext';

export default function MoreDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const router = useRouter();
  const { isMobile } = useMobile();
  const { user, isAuthenticated, logout } = useUser();
  const { isFeatureEnabled } = useFeatureFlags();
  const { confirmNavigation } = useNavigationGuard();

  // Get camps link URL based on user state
  const getCampsLink = () => {
    if (!isAuthenticated || !user?.camps || user.camps.length === 0) {
      return '/camps'; // Landing page
    } else if (user.camps.length === 1) {
      return `/camp/${user.camps[0].id}`; // Direct to camp dashboard
    } else {
      return '/camps'; // List page
    }
  };

  // Get teams link URL based on user state
  const getTeamsLink = () => {
    if (!isAuthenticated || !user?.teams || user.teams.length === 0) {
      return '/teams'; // Landing page
    } else if (user.teams.length === 1) {
      return `/team/${user.teams[0].id}`; // Direct to team dashboard
    } else {
      return '/teams'; // List page
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  // Prevent body scroll when mobile modal is open
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isMobile, isOpen]);

  const handleLinkClick = () => {
    setIsOpen(false);
  };

  const handleLogout = async () => {
    // Check if navigation is allowed (e.g., no unsaved work)
    if (!confirmNavigation()) {
      return; // Navigation guard prevented logout
    }
    await logout();
    setIsOpen(false);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  if (isMobile) {
    return (
      <>
        <button
          onClick={handleToggle}
          className="mobile-more-button"
          title="More"
        >
          <FaBars size={20} />
        </button>

        {isOpen && (
          <div className="mobile-more-modal-overlay" onClick={() => setIsOpen(false)}>
            <div className="mobile-more-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-more-modal-header">
                <h3>More Options</h3>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="mobile-more-modal-close"
                  title="Close"
                >
                  <FaTimes />
                </button>
              </div>
              <div className="mobile-more-modal-body">
                <GuardedLink className="mobile-more-link" href={getCampsLink()} onClick={handleLinkClick}>
                  <FaCampground />
                  <span>Camps</span>
                </GuardedLink>
                <GuardedLink className="mobile-more-link" href={getTeamsLink()} onClick={handleLinkClick}>
                  <FaUsers />
                  <span>Teams</span>
                </GuardedLink>
                {isFeatureEnabled('subscriptions', false) && (
                  <GuardedLink className="mobile-more-link" href="/subscribe" onClick={handleLinkClick}>
                    <FaCrown />
                    <span>Subscribe</span>
                  </GuardedLink>
                )}
                <GuardedLink className="mobile-more-link" href="/release-notes" onClick={handleLinkClick}>
                  <FaNewspaper />
                  <span>Release Notes</span>
                </GuardedLink>
                <GuardedLink className="mobile-more-link" href="/help" onClick={handleLinkClick}>
                  <FaQuestionCircle />
                  <span>Help</span>
                </GuardedLink>
                <GuardedLink className="mobile-more-link" href="/about" onClick={handleLinkClick}>
                  <FaInfoCircle />
                  <span>About</span>
                </GuardedLink>
                <GuardedLink className="mobile-more-link" href="/faq" onClick={handleLinkClick}>
                  <FaQuestionCircle />
                  <span>FAQ</span>
                </GuardedLink>
                <GuardedLink className="mobile-more-link" href="/contact" onClick={handleLinkClick}>
                  <FaEnvelope />
                  <span>Contact</span>
                </GuardedLink>
                <GuardedLink className="mobile-more-link" href="/privacy" onClick={handleLinkClick}>
                  <FaShieldAlt />
                  <span>Privacy Policy</span>
                </GuardedLink>
                <GuardedLink className="mobile-more-link" href="/terms" onClick={handleLinkClick}>
                  <FaGavel />
                  <span>Terms of Service</span>
                </GuardedLink>
                {isAuthenticated && (
                  <button className="mobile-more-link" onClick={handleLogout}>
                    <FaSignOutAlt />
                    <span>Logout</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop dropdown (original behavior)
  return (
    <div className="relative notification-dropdown" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="notification-button"
        title="More"
      >
        <FaBars size={20} />
        More
      </button>

      {isOpen && (
        <div className="notification-panel">
          <div className="more-dropdown-header">
          </div>
          <div className="notification-body">
            <GuardedLink className="nav-link" href={getCampsLink()} onClick={handleLinkClick}><FaCampground />Camps</GuardedLink>
            <GuardedLink className="nav-link" href={getTeamsLink()} onClick={handleLinkClick}><FaUsers />Teams</GuardedLink>
            {isFeatureEnabled('subscriptions', false) && (
              <GuardedLink className="nav-link" href="/subscribe" onClick={handleLinkClick}><FaCrown />Subscribe</GuardedLink>
            )}
            <GuardedLink className="nav-link" href="/release-notes" onClick={handleLinkClick}><FaNewspaper />Release Notes</GuardedLink>
            <GuardedLink className="nav-link" href="/help" onClick={handleLinkClick}><FaQuestionCircle />Help</GuardedLink>
            <GuardedLink className="nav-link" href="/about" onClick={handleLinkClick}><FaInfoCircle />About</GuardedLink>
            <GuardedLink className="nav-link" href="/faq" onClick={handleLinkClick}><FaQuestionCircle />FAQ</GuardedLink>
            <GuardedLink className="nav-link" href="/contact" onClick={handleLinkClick}><FaEnvelope />Contact</GuardedLink>
            <GuardedLink className="nav-link" href="/privacy" onClick={handleLinkClick}><FaShieldAlt />Privacy Policy</GuardedLink>
            <GuardedLink className="nav-link" href="/terms" onClick={handleLinkClick}><FaGavel />Terms of Service</GuardedLink>
          </div>
        </div>
      )}
    </div>
  );
} 