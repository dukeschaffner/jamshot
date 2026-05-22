'use client';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export default function ForgotPassword() {
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Forgot Password</h1>
      <ForgotPasswordForm />
    </div>
  );
}

