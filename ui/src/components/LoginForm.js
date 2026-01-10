'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';
import { useRouter } from 'next/navigation';
import ForgotPasswordForm from './ForgotPasswordForm';
import { validateDateOfBirth } from '../../shared/utils/validation';
import { validatePassword, validateUsername, validateName, validateEmail, checkPasswordRequirements } from '../lib/validation';

export default function LoginForm({ 
  onSuccess, 
  onError,
  redirectUrl = null,
  showLinks = true,
  noRedirect = false,
  initialMode = 'login' // 'login' or 'signup'
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState(null);
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [passwordRequirements, setPasswordRequirements] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecialChar: false,
  });
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const router = useRouter();

  // Check if user is already logged in


  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setNeedsVerification(false);
    setIsLoggingIn(true);

    let result = null;
    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error){
        const isUnverifiedError = result?.error?.code === 'EMAIL_NOT_VERIFIED';
        if (isUnverifiedError) {
          setNeedsVerification(true);
          setError(result?.error?.message);
        }
      }
      else if (result.data?.user) {
        setUser(result.data.user);
        setSuccess('Login successful!');
        if (onSuccess) {
          onSuccess();
        }
        // Handle redirect if not disabled
        if (!noRedirect && redirectUrl) {
          router.push(redirectUrl);
        } else if (!noRedirect) {
          router.push('/');
        }
      } else {
        const errorMessage = 'Login failed - no user data returned';
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      }
    } catch (err) {
        const displayMessage = 'Login failed - Unexpected error';
        setError(displayMessage);
        if (onError) {
          onError(displayMessage);
        }
      console.error('Email/password login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoggingIn(true);

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin + (redirectUrl || '/')
      });

    } catch (err) {
      const errorMessage = err.message || 'Google OAuth failed. Please try again.';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      console.error('Google OAuth error:', err);
      setIsLoggingIn(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setNeedsVerification(false);
    setUsernameError('');
    setConfirmPasswordError('');
    
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
    if (!dateOfBirth) {
      setError('Date of birth is required.');
      return;
    }
    
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
      const errorMsg = 'Passwords do not match';
      setError(errorMsg);
      setConfirmPasswordError(errorMsg);
      setShowPasswordRequirements(true);
      return;
    }
    
    // Check if terms are accepted
    if (!acceptTerms) {
      setError('You must accept the Terms of Service and Privacy Policy to register.');
      return;
    }
    
    setIsLoggingIn(true);

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        // name,
        // username,
        // dateOfBirth,
        // acceptTerms,
      });

      if (result.data?.user) {
        // Check if email is verified
        const isEmailVerified = result.data.user.emailVerified;
        
        if (!isEmailVerified) {
          // User signed up but email is not verified
          setNeedsVerification(true);
          setSuccess('');
          setError('');
        } else {
          setUser(result.data.user);
          setSuccess('Account created successfully!');
          if (onSuccess) {
            onSuccess();
          }
          // Handle redirect if not disabled
          if (!noRedirect) {
            router.push(redirectUrl || '/');
          }
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
      if (onError) {
        onError(errorMessage);
      }
      console.error('Sign up error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    
    setIsResendingVerification(true);
    setError('');
    
    try {
      const frontendUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const callbackURL = `${frontendUrl}${redirectUrl || '/'}`;
      
      await authClient.sendVerificationEmail({
        email,
        callbackURL,
      });
      
      setSuccess('Verification email sent! Please check your inbox.');
    } catch (err) {
      const errorMessage = err.message || 'Failed to send verification email. Please try again.';
      setError(errorMessage);
      console.error('Resend verification error:', err);
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      setSuccess('Logged out successfully');
      setUser(null);
      setUserPlan(getUserPlan(null)); // Set to free plan instead of null
      router.push('/login');
    } catch (error) {
      setError('Logout failed');
      console.error('Logout error:', error);
    }
  };


  // Determine header text based on form state
  const getHeaderText = () => {
    if (showForgotPassword) return 'Forgot Password';
    if (isSignUp) return 'Sign Up';
    return 'Login';
  };

  // If showing forgot password form, render it
  if (showForgotPassword) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">{getHeaderText()}</h2>
        <ForgotPasswordForm
          onSuccess={onSuccess}
          onError={onError}
          redirectUrl={redirectUrl}
          showLinks={false}
          noRedirect={noRedirect}
        />
        <div className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={() => setShowForgotPassword(false)}
            className="text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // If email verification is needed, show verification message instead of login form
  if (needsVerification) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Verify Your Email</h2>
        
        <div style={{
          backgroundColor: 'var(--grey-1)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <p className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Please verify your email address
          </p>
          <p style={{
            color: 'var(--text-secondary)',
            marginBottom: '16px',
            lineHeight: '1.6'
          }}>
            We&apos;ve sent a verification email to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>. Please check your inbox and click the verification link to activate your account.
          </p>
          
          {success && (
            <div className="mb-4" style={{
              backgroundColor: 'rgba(147, 233, 190, 0.15)',
              border: '1px solid var(--seafoam)',
              borderRadius: '8px',
              padding: '12px',
              color: 'var(--text-primary)',
              fontSize: '0.95rem'
            }}>
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4" style={{
              backgroundColor: 'rgba(252, 50, 50, 0.1)',
              border: '1px solid var(--red)',
              borderRadius: '8px',
              padding: '12px',
              color: 'var(--red)',
              fontSize: '0.95rem'
            }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleResendVerification}
            disabled={isResendingVerification}
            className="pill-btn green-btn"
            style={{
              width: '100%',
              marginBottom: '16px',
              opacity: isResendingVerification ? 0.6 : 1,
              cursor: isResendingVerification ? 'not-allowed' : 'pointer'
            }}
          >
            {isResendingVerification ? 'Sending...' : 'Resend verification email'}
          </button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setNeedsVerification(false);
              setError('');
              setSuccess('');
              setPassword('');
              setConfirmPassword('');
              setUsernameError('');
              setConfirmPasswordError('');
              setShowPasswordRequirements(false);
              setPasswordRequirements({
                minLength: false,
                hasUppercase: false,
                hasLowercase: false,
                hasNumber: false,
                hasSpecialChar: false,
              });
              setIsResendingVerification(false);
            }}
            className="pill-btn"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{getHeaderText()}</h2>
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Google OAuth Button */}
      <div className="mb-4">
        <button
          onClick={handleGoogleLogin}
          disabled={isLoggingIn}
          className="w-full pill-btn disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-sm">{isLoggingIn ? 'Redirecting...' : 'Continue with Google'}</span>
        </button>
      </div>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">Or continue with email</span>
        </div>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={isSignUp ? handleSignUp : handleEmailPasswordLogin} className="space-y-4">
        {isSignUp && (
          <>
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
                disabled={isLoggingIn}
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
                placeholder="Full Name"
                className="w-full p-2 border rounded"
                required
                disabled={isLoggingIn}
                maxLength={40}
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
                disabled={isLoggingIn}
                max={new Date().toISOString().split('T')[0]} // Prevent future dates
              />
              <p className="text-xs text-gray-500 mt-1">You must be at least 13 years old to register.</p>
            </div>
          </>
        )}
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (needsVerification) {
                setNeedsVerification(false);
              }
            }}
            placeholder="Email"
            className="w-full p-2 border rounded"
            required
            disabled={isLoggingIn}
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
            onChange={(e) => {
              const newPassword = e.target.value;
              setPassword(newPassword);
              if (isSignUp) {
                const requirements = checkPasswordRequirements(newPassword);
                setPasswordRequirements(requirements);
                setShowPasswordRequirements(true);
                // Clear error if password becomes valid
                if (requirements.minLength && requirements.hasUppercase && 
                    requirements.hasLowercase && requirements.hasNumber && 
                    requirements.hasSpecialChar) {
                  setError('');
                }
              }
            }}
            onFocus={() => {
              if (isSignUp) {
                setShowPasswordRequirements(true);
              }
            }}
            placeholder="Password"
            className="w-full p-2 border rounded"
            required
            disabled={isLoggingIn}
          />
          {isSignUp && showPasswordRequirements && (
            <div className="mt-1 text-xs">
              <p className="text-gray-700 font-medium mb-1">Password must:</p>
              <ul className="space-y-0.5">
                <li className={passwordRequirements.minLength ? 'text-green-600' : 'text-gray-500'}>
                  {passwordRequirements.minLength ? '✓' : '✗'} Be at least 8 characters long
                </li>
                <li className={passwordRequirements.hasUppercase ? 'text-green-600' : 'text-gray-500'}>
                  {passwordRequirements.hasUppercase ? '✓' : '✗'} Contain at least one uppercase letter
                </li>
                <li className={passwordRequirements.hasLowercase ? 'text-green-600' : 'text-gray-500'}>
                  {passwordRequirements.hasLowercase ? '✓' : '✗'} Contain at least one lowercase letter
                </li>
                <li className={passwordRequirements.hasNumber ? 'text-green-600' : 'text-gray-500'}>
                  {passwordRequirements.hasNumber ? '✓' : '✗'} Contain at least one number
                </li>
                <li className={passwordRequirements.hasSpecialChar ? 'text-green-600' : 'text-gray-500'}>
                  {passwordRequirements.hasSpecialChar ? '✓' : '✗'} Contain at least one special character (!@#$%^&*)
                </li>
              </ul>
            </div>
          )}
        </div>

        {isSignUp && (
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                const newConfirmPassword = e.target.value;
                setConfirmPassword(newConfirmPassword);
                if (newConfirmPassword && password && newConfirmPassword !== password) {
                  setConfirmPasswordError('Passwords do not match');
                } else {
                  setConfirmPasswordError('');
                }
              }}
              placeholder="Confirm Password"
              className={`w-full p-2 border rounded ${confirmPasswordError ? 'border-red-500' : ''}`}
              required
              disabled={isLoggingIn}
            />
            {confirmPasswordError && (
              <div className="text-red-600 text-sm mt-1">{confirmPasswordError}</div>
            )}
            {confirmPassword && password && confirmPassword === password && !confirmPasswordError && (
              <div className="text-green-600 text-sm mt-1">✓ Passwords match</div>
            )}
          </div>
        )}

        {isSignUp && (
          <div className="flex items-start space-x-2">
              <input
                id="acceptTerms"
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1"
                required
                disabled={isLoggingIn}
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
        )}
        
        <button 
          type="submit" 
          className="w-full pill-btn gradient-btn disabled:opacity-50"
          disabled={isLoggingIn}
        >
          {isLoggingIn 
            ? (isSignUp ? 'Creating account...' : 'Logging in...') 
            : (isSignUp ? 'Create Account' : 'Login')
          }
        </button>
      </form>

      {showLinks && !isSignUp && (
        <div className="mt-4 space-y-2 text-center text-sm">
          <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            Forgot password?
          </button>
        </div>
      )}

      {showLinks && (
        <>
          {/* Toggle between Login and Sign Up */}
          <div className="mt-1 space-y-2 text-center text-sm">
          {isSignUp ? (
            <div className="mt-2">
              <span className="text-black">Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  // Reset sign up specific state
                  setShowPasswordRequirements(false);
                  setPasswordRequirements({
                    minLength: false,
                    hasUppercase: false,
                    hasLowercase: false,
                    hasNumber: false,
                    hasSpecialChar: false,
                  });
                  setConfirmPassword('');
                  setConfirmPasswordError('');
                  setUsernameError('');
                  setError('');
                  setNeedsVerification(false);
                }}
                className="text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Sign in
              </button>
            </div>
          ) : (
            <div>
              <span className="text-black">Don&apos;t have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  // Reset password state when switching to sign up
                  setPassword('');
                  setConfirmPassword('');
                  setShowPasswordRequirements(false);
                  setPasswordRequirements({
                    minLength: false,
                    hasUppercase: false,
                    hasLowercase: false,
                    hasNumber: false,
                    hasSpecialChar: false,
                  });
                  setConfirmPasswordError('');
                  setError('');
                  setNeedsVerification(false);
                }}
                className="text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Sign up
              </button>
            </div>
          )}
        </div>
        </>
      )}

      
    </div>
  );
}

