'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '../../lib/api';
import Cookies from 'js-cookie';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Check if passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setShowPasswordRequirements(true);
      return;
    }
    
    try {
      const response = await api.post('/auth/register', { username, email, password });
      
      // Store both tokens in cookies
      const { accessToken, refreshToken } = response.data;
      
      // Store access token with short expiry (1 hour)
      Cookies.set('accessToken', accessToken, { 
        expires: 1/24, // 1 hour in days
        sameSite: 'strict'
      });
      
      // Store refresh token with longer expiry (30 days)
      Cookies.set('refreshToken', refreshToken, { 
        expires: 30, 
        sameSite: 'strict'
      });
      
      // Show success message instead of redirecting
      setSuccess(response.data.message || 'Registration successful! Please check your email to verify your account.');
      setIsRegistered(true);
      
      // Clear form
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
      setShowPasswordRequirements(true);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Register</h1>
      
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>{success}</p>
          {isRegistered && (
            <p className="mt-2">
              You can <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">log in</Link> once you've verified your email.
            </p>
          )}
        </div>
      )}
      
      {!isRegistered && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full p-2 border rounded"
              required
            />
            {showPasswordRequirements && (
              <div className="mt-1 text-xs text-gray-500">
                <p>Password must:</p>
                <ul className="list-disc pl-5">
                  <li>Be at least 8 characters long</li>
                  <li>Contain at least one uppercase letter</li>
                  <li>Contain at least one lowercase letter</li>
                  <li>Contain at least one number</li>
                  <li>Contain at least one special character (!@#$%^&*)</li>
                </ul>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              className="w-full p-2 border rounded"
              required
            />
          </div>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Register
          </button>
          
          <div className="text-center mt-4">
            <span className="text-gray-600">Already have an account? </span>
            <Link href="/login" className="text-blue-600 hover:text-blue-800">
              Login
            </Link>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            <p>By registering, you'll receive a verification email. You must verify your email before you can log in.</p>
          </div>
        </form>
      )}
    </div>
  );
}