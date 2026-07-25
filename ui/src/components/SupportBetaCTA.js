'use client';

import Link from 'next/link';
import { FaHeart } from 'react-icons/fa';
import styles from './SupportBetaCTA.module.css';

export default function SupportBetaCTA({ className = '', flushTop = false }) {
  return (
    <div
      className={[
        styles.card,
        flushTop ? styles.flushTop : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.badge}>
        <FaHeart className={styles.badgeIcon} />
        Support the beta
      </div>

      <div className={styles.content}>
        <h3 className={styles.title}>Unlock more features</h3>
        <p className={styles.description}>
          Subscribe to support development and level up your sterio experience.
        </p>

        <Link href="/subscribe" className={`pill-btn gradient-btn sm ${styles.button}`}>
          View plans
        </Link>
      </div>
    </div>
  );
}

