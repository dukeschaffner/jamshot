'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import EditProfile from '../../../components/EditProfile';
import NotificationsSettings from '../../../components/NotificationsSettings';
import Link from 'next/link';
import styles from './EditPage.module.css';

export default function EditPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useUser();
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // User is not logged in, but don't redirect automatically
      // Show login link instead
    }
  }, [isAuthenticated, isLoading]);

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
            onClick={() => setActiveTab('profile')}
          >
            Edit Profile
          </button>
          <button
            className={`${styles.navItem} ${activeTab === 'notifications' ? styles.active : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications
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

