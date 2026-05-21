'use client';

import styles from './MarketingHome.module.css';

export default function MarketingHome() {
  return (
    <iframe
      className={styles.frame}
      src="/marketing/index.html"
      title="Sterio"
    />
  );
}
