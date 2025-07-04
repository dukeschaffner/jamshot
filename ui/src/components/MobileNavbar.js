'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FaHome, FaSearch, FaUser } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';

export default function MobileNavbar() {
  const { user, isAuthenticated } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const handleSearchClick = () => {
    router.push('/search');
  };

  return (
    <nav className="mobile-navbar">
      <Link href="/" className={`mobile-nav-item ${pathname === '/' ? 'active' : ''}`}>
        <FaHome />
        <span>Home</span>
      </Link>
      
      <button 
        onClick={handleSearchClick}
        className={`mobile-nav-item ${pathname.startsWith('/search') ? 'active' : ''}`}
      >
        <FaSearch />
        <span>Search</span>
      </button>
      
      {isAuthenticated && user ? (
        <Link 
          href={`/user/${user.username}`} 
          className={`mobile-nav-item ${pathname.startsWith('/user/') ? 'active' : ''}`}
        >
          <div className="mobile-nav-avatar">
            <img 
              src={user.profile_pic_url || '/avatar.svg'} 
              alt={`${user.username}'s avatar`} 
            />
          </div>
          <span>Profile</span>
        </Link>
      ) : (
        <Link 
          href="/login" 
          className={`mobile-nav-item ${pathname === '/login' ? 'active' : ''}`}
        >
          <FaUser />
          <span>Login</span>
        </Link>
      )}
    </nav>
  );
} 