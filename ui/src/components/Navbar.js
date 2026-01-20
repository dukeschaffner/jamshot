'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FaHome, FaUpload, FaSearch, FaSun, FaMoon, FaTrophy, FaUsers } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import { useMobile } from '../contexts/MobileContext';
import { trackSearch } from '../lib/analytics';
import NotificationDropdown from './NotificationDropdown';
import MoreDropdown from './MoreDropdown';
import Image from 'next/image';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useUser();
  const { isMobile } = useMobile();
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const pathname = usePathname();
  const router = useRouter();
  const allowDarkMode = false;

  const toggleTheme = (e) => {
    e.preventDefault();
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    setDarkMode(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      trackSearch(searchQuery.trim());
      router.push(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <nav className="navbar">
      <div className="logo">
        <Link href="/">
          <span className="logo-title">sterio</span>
        </Link>
      </div>
      
      {/* Only show search box on desktop */}
      {!isMobile && (
        <div className="search-box">
          <form onSubmit={handleSearch}>
            <FaSearch className="search-icon" />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search for artists, tracks..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>
      )}
      
      <div className="nav-links">
        <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
          <FaHome />
          Home
        </Link>
        
        <Link href="/competitions" className={`nav-link ${pathname === '/competitions' ? 'active' : ''}`}>
          <FaTrophy />
          Competitions
        </Link>

        {isAuthenticated && (
          <div className="nav-link nav-link-pop-out-btn">
            <NotificationDropdown />
          </div>
        )}
        <div className="nav-link nav-link-pop-out-btn">
            <MoreDropdown />
        </div>
        
        {allowDarkMode && (
          <a href="#" className="nav-link theme-toggle" onClick={toggleTheme}>
            {darkMode ? <FaMoon /> : <FaSun />}
            <span>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
          </a>
        )}
      </div>
      
      {isAuthenticated ? (
        <>
          <Link href="/upload" className="pill-btn gradient-btn mx-5 mb-3">
            <FaUpload />
            Upload Track
          </Link>
          
          <Link href={`/user/${user?.username}`} className="user-profile">
            <Image
                className="avatar mr-1"
                src={user?.profile_pic_url || '/avatar.svg'} 
                alt={user.username}
                width={40}
                height={40}
            />
            <div className="user-info">
              <div className="user-name">{user?.name || user?.username || 'Loading...'}</div>
              <div className="user-handle">@{user?.username || 'loading'}</div>
            </div>
          </Link>
          
          <button 
            onClick={handleLogout} 
            className="ml-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 link-underline"
            title="Logout"
          >
            Logout
          </button>
        </>
      ) : (
        <div className="auth-buttons">
          <Link href="/login" className="pill-btn border-solid">
            Login
          </Link>
          <Link href="/register" className="pill-btn gradient-btn">
            Register
          </Link>
        </div>
      )}
    </nav>
  );
} 