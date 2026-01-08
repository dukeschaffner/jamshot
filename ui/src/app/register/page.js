'use client';
import RegisterForm from '../../components/RegisterForm';

export default function Register() {
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Register</h1>
      <RegisterForm />
    </div>
  );
}

