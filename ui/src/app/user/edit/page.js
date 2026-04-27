import { Suspense } from 'react';
import EditPageClient from './EditPageClient';

export default function EditPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <EditPageClient />
    </Suspense>
  );
}

