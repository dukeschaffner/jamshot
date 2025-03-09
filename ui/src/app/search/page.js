import { Suspense } from 'react';
import SearchClient from './SearchClient';

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="loading">Loading search results...</div>}>
      <SearchClient />
    </Suspense>
  );
} 