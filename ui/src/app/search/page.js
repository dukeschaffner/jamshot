import { Suspense } from 'react';
import SearchClient from './SearchClient';
import styles from './SearchPage.module.css';

export default function SearchPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Loading search results...</div>}>
      <SearchClient />
    </Suspense>
  );
} 