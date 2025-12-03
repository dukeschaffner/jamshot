'use client';
import { useRouter } from 'next/navigation';
import { FaCampground, FaArrowRight, FaPlus } from 'react-icons/fa';
import Link from 'next/link';
import styles from './CampsList.module.css';
import sharedStyles from '../../styles/Dashboard.module.css';

export default function CampsList({ camps }) {
  const router = useRouter();

  if (!camps || camps.length === 0) {
    return (
      <div className={sharedStyles.emptyState}>
        <FaCampground className={sharedStyles.emptyIcon} />
        <h3>No Camps Yet</h3>
        <p>Create your first camp to start collaborating</p>
        <Link href="/camps/create" className={styles.createButton}>
          <FaPlus />
          Create Camp
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.campsListContainer}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerInfo}>
            <FaCampground className={styles.headerIcon} />
            <div>
              <h1 className={styles.title}>Your Camps</h1>
              <p className={styles.subtitle}>Manage and access your camp dashboards</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href="/camps/create" className={styles.createButton}>
              <FaPlus />
              Create Camp
            </Link>
            <Link href="/camps/about" className={styles.learnMoreLink}>
              Learn More About Camps
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.campsGrid}>
        {camps.map((camp) => (
          <div
            key={camp.id}
            className={styles.campCard}
            onClick={() => router.push(`/camp/${camp.id}`)}
          >
            <div className={styles.campCardContent}>
              <div className={styles.campIcon}>
                <FaCampground />
              </div>
              <div className={styles.campInfo}>
                <h3 className={styles.campName}>{camp.name}</h3>
                <div className={styles.campMeta}>
                  <span className={styles.campRole}>
                    {camp.role === 'owner' ? 'Owner' : camp.role === 'admin' ? 'Admin' : 'Contributor'}
                  </span>
                </div>
              </div>
              <div className={styles.campArrow}>
                <FaArrowRight />
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

