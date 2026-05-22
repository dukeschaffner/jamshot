import { Suspense } from 'react';
import ResetPasswordClient from './ResetPasswordClient';

export default function ResetPassword() {
  return (
    <Suspense
      fallback={<div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">Loading...</div>}
    >
      <ResetPasswordClient />
    </Suspense>
  );
}

