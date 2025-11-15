'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FaHome, FaSearch, FaUser, FaBell, FaUsers } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../lib/NotificationContext';
import MoreDropdown from './MoreDropdown';
import Image from 'next/image';
import styles from './Notifications.module.css';

export default function MobileNavbar() {
  const { user, isAuthenticated } = useUser();
  const { unreadCount } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();

  const handleSearchClick = () => {
    router.push('/search');
  };

  // Get teams link URL based on user state
  const getTeamsLink = () => {
    if (!isAuthenticated || !user?.teams || user.teams.length === 0) {
      return '/teams'; // Landing page
    } else if (user.teams.length === 1) {
      return `/teams/${user.teams[0].id}`; // Direct to team dashboard
    } else {
      return '/teams'; // List page
    }
  };

  return (
    <nav className="mobile-navbar">
      <Link href="/" className={`mobile-nav-item ${pathname === '/' ? 'active' : ''}`}>
        <FaHome />
      </Link>
      
      <button 
        onClick={handleSearchClick}
        className={`mobile-nav-item ${pathname.startsWith('/search') ? 'active' : ''}`}
      >
        <FaSearch />
      </button>
      
      <Link 
        href={getTeamsLink()}
        className={`mobile-nav-item ${pathname.startsWith('/teams') ? 'active' : ''}`}
      >
        <FaUsers />
      </Link>
      
      {/* Notifications - only show for authenticated users */}
      {isAuthenticated && (
        <Link 
          href="/notifications" 
          className={`mobile-nav-item ${pathname === '/notifications' ? 'active' : ''}`}
        >
          <div className="notification-icon-wrapper">
            <FaBell />
            {unreadCount > 0 && (
              <span className={styles.notificationDot}></span>
            )}
          </div>
        </Link>
      )}
      
      {isAuthenticated && user ? (
        <Link 
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
        </Link>
      ) : (
        <Link 
          href="/login" 
          className={`mobile-nav-item ${pathname === '/login' ? 'active' : ''}`}
        >
          <FaUser />
        </Link>
      )}

      {/* More dropdown - always visible */}
      <div className="mobile-nav-item">
        <MoreDropdown />
      </div>
    </nav>
  );
} 