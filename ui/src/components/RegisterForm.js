'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';
import { validatePassword, validateUsername, validateName, validateEmail } from '../lib/validation';
import { validateDateOfBirth } from '../../shared/utils/validation';

export default function RegisterForm({ 
  onSuccess, 
  onError,
  redirectUrl = null,
  showLinks = true,
  noRedirect = false
}) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setUsernameError('');
    
    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      setUsernameError(usernameValidation.message);
      return;
    }
    
    // Validate name
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      setError(nameValidation.message);
      return;
    }
    
    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setError(emailValidation.message);
      return;
    }
    
    // Validate date of birth
    const dobValidation = validateDateOfBirth(dateOfBirth);
    if (!dobValidation.valid) {
      setError(dobValidation.error);
      return;
    }
    
    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.message);
      setShowPasswordRequirements(true);
      return;
    }
    
    // Check if passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setShowPasswordRequirements(true);
      return;
    }
    
    // Check if terms are accepted
    if (!acceptTerms) {
      setError('You must accept the Terms of Service and Privacy Policy to register.');
      return;
    }
    
    setIsRegistering(true);
    
    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
        username: username.toLowerCase(),
      });

      if (result.data?.user) {
        setSuccess('Registration successful! Please check your email to verify your account.');
        setIsRegistered(true);
        
        // Clear form
        setUsername('');
        setName('');
        setEmail('');
        setDateOfBirth('');
        setPassword('');
        setConfirmPassword('');
        setAcceptTerms(false);
        
        if (onSuccess) {
          onSuccess();
        }
        
        // Handle redirect if not disabled
        if (!noRedirect && redirectUrl) {
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 2000);
        } else if (!noRedirect) {
          // Don't redirect automatically - user needs to verify email first
        }
      } else {
        const errorMessage = 'Sign up failed - no user data returned';
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Sign up failed. Please try again.';
      setError(errorMessage);
      setShowPasswordRequirements(true);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Sign up error:', err);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div>
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>{success}</p>
          {isRegistered && showLinks && (
            <p className="mt-2">
              You can <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">log in</Link> once you&apos;ve verified your email.
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
              onChange={(e) => {
                const value = e.target.value;
                setUsername(value);
                const validation = validateUsername(value);
                if (!validation.valid) {
                  setUsernameError(validation.message);
                } else {
                  setUsernameError('');
                }
              }}
              placeholder="Username"
              className="w-full p-2 border rounded"
              required
              disabled={isRegistering}
              maxLength={20}
            />
            {usernameError && <div className="text-red-600 text-sm mt-1">{usernameError}</div>}
          </div>
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full p-2 border rounded"
              required
              disabled={isRegistering}
              maxLength={40}
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
              disabled={isRegistering}
            />
          </div>
          
          <div>
            <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full p-2 border rounded"
              required
              disabled={isRegistering}
              max={new Date().toISOString().split('T')[0]} // Prevent future dates
            />
            <p className="text-xs text-gray-500 mt-1">You must be at least 13 years old to register.</p>
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
              disabled={isRegistering}
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
              disabled={isRegistering}
            />
          </div>
          
          <div className="flex items-start space-x-2">
            <input
              id="acceptTerms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1"
              required
              disabled={isRegistering}
            />
            <label htmlFor="acceptTerms" className="text-sm text-gray-700">
              I agree to the{' '}
              <Link href="/terms" className="text-seafoam hover:underline" target="_blank">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-seafoam hover:underline" target="_blank">
                Privacy Policy
              </Link>
            </label>
          </div>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={isRegistering}
          >
            {isRegistering ? 'Registering...' : 'Register'}
          </button>
          
          {showLinks && (
            <div className="text-center mt-4">
              <span className="text-gray-600">Already have an account? </span>
              <Link href="/login" className="text-blue-600 hover:text-blue-800">
                Login
              </Link>
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-600">
            <p>By registering, you&apos;ll receive a verification email. You must verify your email before you can log in.</p>
          </div>
        </form>
      )}
    </div>
  );
}

