'use client';
import { Suspense } from 'react';
import LoginForm from '../../components/LoginForm';

export default function Register() {
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <Suspense fallback={null}>
        <LoginForm initialMode="signup" />
      </Suspense>
    </div>
  );
}

