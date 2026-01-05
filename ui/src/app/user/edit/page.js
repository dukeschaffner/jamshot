'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import EditProfile from '../../../components/EditProfile';
import NotificationsSettings from '../../../components/NotificationsSettings';
import Link from 'next/link';
import styles from './EditPage.module.css';

export default function EditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useUser();
  const [activeTab, setActiveTab] = useState('profile');

  // Read tab from URL params on mount
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    const validTabs = ['profile', 'notifications'];
    
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // User is not logged in, but don't redirect automatically
      // Show login link instead
    }
  }, [isAuthenticated, isLoading]);

  // Handle tab change and update URL
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    
    // Update URL without causing a page reload
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('tab', tab);
    router.replace(newUrl.pathname + newUrl.search, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className={styles.editPage}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.editPage}>
        <div className={styles.notLoggedIn}>
          <h1>Please log in</h1>
          <p>You need to be logged in to edit your profile.</p>
          <Link href="/login" className="pill-btn">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editPage}>
      <div className={styles.sidebar}>
        <nav className={styles.sidebarNav}>
          <button
            className={`${styles.navItem} ${activeTab === 'profile' ? styles.active : ''}`}
            onClick={() => handleTabChange('profile')}
          >
            Edit Profile
          </button>
          <button
            className={`${styles.navItem} ${activeTab === 'notifications' ? styles.active : ''}`}
            onClick={() => handleTabChange('notifications')}
          >
            Email Notifications
          </button>
        </nav>
      </div>
      <div className={styles.mainContent}>
        {activeTab === 'profile' && <EditProfile user={user} />}
        {activeTab === 'notifications' && <NotificationsSettings />}
      </div>
    </div>
  );
}

