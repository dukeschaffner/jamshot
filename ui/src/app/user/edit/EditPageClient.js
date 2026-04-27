'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import EditProfile from '../../../components/EditProfile';
import NotificationsSettings from '../../../components/NotificationsSettings';
import Link from 'next/link';
import styles from './EditPage.module.css';

export default function EditPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useUser();
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    const validTabs = ['profile', 'notifications'];

    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);

    const newUrl = new URL(window.location.href);
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
            type="button"
          >
            Edit Profile
          </button>
          <button
            className={`${styles.navItem} ${activeTab === 'notifications' ? styles.active : ''}`}
            onClick={() => handleTabChange('notifications')}
            type="button"
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

