'use client';
import Link from 'next/link';
import GuardedLink from './GuardedLink';
import { usePathname, useRouter } from 'next/navigation';
import { FaHome, FaSearch, FaUser, FaBell, FaUsers } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../lib/NotificationContext';
import { useNavigationGuard } from '../contexts/NavigationGuardContext';
import MoreDropdown from './MoreDropdown';
import Image from 'next/image';
import styles from './Notifications.module.css';

export default function MobileNavbar() {
  const { user, isAuthenticated } = useUser();
  const { unreadCount } = useNotifications();
  const { confirmNavigation } = useNavigationGuard();
  const pathname = usePathname();
  const router = useRouter();

  const handleSearchClick = () => {
    // Check if navigation is allowed (e.g., no unsaved work)
    if (!confirmNavigation()) {
      return; // Navigation guard prevented search
    }
    router.push('/search');
  };

  return (
    <nav className="mobile-navbar">
      <GuardedLink href="/" className={`mobile-nav-item ${pathname === '/' ? 'active' : ''}`}>
        <FaHome />
      </GuardedLink>
      
      <button
        onClick={handleSearchClick}
        className={`mobile-nav-item ${pathname.startsWith('/search') ? 'active' : ''}`}
      >
        <FaSearch />
      </button>

      {/* Notifications - only show for authenticated users */}
      {isAuthenticated && (
        <GuardedLink
          href="/notifications"
          className={`mobile-nav-item ${pathname === '/notifications' ? 'active' : ''}`}
        >
          <div className="notification-icon-wrapper">
            <FaBell />
            {unreadCount > 0 && (
              <span className={styles.notificationDot}></span>
            )}
          </div>
        </GuardedLink>
      )}
      
      {isAuthenticated && user ? (
        <GuardedLink
          href={`/user/${user.username}`}
          className={`mobile-nav-item ${pathname.startsWith('/user/') ? 'active' : ''}`}
        >
        <Image
            className="avatar"
            src={user?.profile_pic_url || '/avatar.svg'} 
            alt={user.username} 
            width={30} 
            height={30}
        />
        </GuardedLink>
      ) : (
        <GuardedLink
          href="/login"
          className={`mobile-nav-item ${pathname === '/login' ? 'active' : ''}`}
        >
          <FaUser />
        </GuardedLink>
      )}

      {/* More dropdown - always visible */}
      <div className="mobile-nav-item">
        <MoreDropdown />
      </div>
    </nav>
  );
} 