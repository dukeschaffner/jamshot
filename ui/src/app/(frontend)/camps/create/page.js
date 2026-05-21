'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { FaCampground, FaCalendarAlt, FaUsers, FaCreditCard, FaClock, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { campApi } from '@/lib/api';
import sharedStyles from '@/styles/SharedForm.module.css';
import styles from './CampCreate.module.css';

function CreateCampClient() {
  const router = useRouter();
  const { user, isAuthenticated } = useUser();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    product_version: '25_users' // Default to 25 users
  });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showLargerOptions, setShowLargerOptions] = useState(false);

  // Pricing information
  const pricing = {
    '5_users': { name: 'Up to 5 Users', price: '$29', description: 'Small groups, intimate sessions' },
    '10_users': { name: 'Up to 10 Users', price: '$49', description: 'Indie-friendly; low-friction' },
    '25_users': { name: 'Up to 25 Users', price: '$99', description: 'School programs, indie pro camps' },
    '50_users': { name: 'Up to 50 Users', price: '$199', description: 'Publisher/label camps' },
    '100_users': { name: 'Up to 100 Users', price: '$299', description: 'Large enterprise writing retreats' }
  };

  // Separate pricing into default (5, 10, 25) and larger (50, 100)
  const defaultPricing = {
    '5_users': pricing['5_users'],
    '10_users': pricing['10_users'],
    '25_users': pricing['25_users']
  };

  const largerPricing = {
    '50_users': pricing['50_users'],
    '100_users': pricing['100_users']
  };

  useEffect(() => {
    // Don't redirect if not authenticated - let component handle it
    if (!isAuthenticated) {
      return;
    }

    // Set default start date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFormData(prev => ({
      ...prev,
      start_date: tomorrow.toISOString().split('T')[0]
    }));
  }, [isAuthenticated, router]);

  // Show larger options if a larger plan is selected
  useEffect(() => {
    if (formData.product_version === '50_users' || formData.product_version === '100_users') {
      setShowLargerOptions(true);
    }
  }, [formData.product_version]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear errors when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Validate form
      if (!formData.name.trim()) {
        throw new Error('Camp name is required');
      }

      if (!formData.start_date) {
        throw new Error('Start date is required');
      }

      const startDate = new Date(formData.start_date);
      const now = new Date();

      if (startDate <= now) {
        throw new Error('Start date must be in the future');
      }

      // Create camp checkout session
      const response = await campApi.createCamp(formData);

      if (response.data.sessionId && response.data.url) {
        // Redirect to Stripe checkout
        window.location.href = response.data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err) {
      console.error('Error creating camp:', err);
      setError(err.message || 'Failed to create camp. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.campCreateContainer}>
        <div className={sharedStyles.authRequired}>
          <FaCampground className={sharedStyles.authIcon} />
          <h1>Login Required</h1>
          <p>You need to be logged in to create a songwriting camp.</p>
          <button
            onClick={() => router.push('/login?redirect=/camps/create')}
            className={sharedStyles.loginButton}
          >
            Login to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.campCreateContainer}>
      <div className={sharedStyles.formContainer}>
        <div className={sharedStyles.formHeader}>
          <FaCampground className={sharedStyles.formHeaderIcon} />
          <h1>Create Songwriting Camp</h1>
          <p>Start your collaborative songwriting journey</p>
        </div>

        <form onSubmit={handleSubmit} className={sharedStyles.form}>
          {/* Camp Details Section */}
          <div className={sharedStyles.formSection}>
            <h3>
              <FaCampground />
              Camp Details
            </h3>

            <div className={sharedStyles.formGroup}>
              <label htmlFor="name" className={sharedStyles.formLabel}>
                Camp Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={sharedStyles.formInput}
                placeholder="e.g., Summer Songwriting Retreat 2025"
                required
                disabled={isLoading}
              />
            </div>

            <div className={sharedStyles.formGroup}>
              <label htmlFor="start_date" className={sharedStyles.formLabel}>
                <FaCalendarAlt />
                Start Date *
              </label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                value={formData.start_date}
                onChange={handleInputChange}
                className={sharedStyles.formInput}
                min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                required
                disabled={isLoading}
              />
              <small className={sharedStyles.formHelp}>
                Your 7-day camp will start on this date and last exactly one week.
              </small>
            </div>
          </div>

          {/* Product Version Section */}
          <div className={sharedStyles.formSection}>
            <h3>
              <FaUsers />
              Camp Size & Pricing
            </h3>

            <div className={sharedStyles.pricingOptions}>
              {Object.entries(defaultPricing).map(([version, info]) => (
                <label key={version} className={sharedStyles.pricingOption}>
                  <input
                    type="radio"
                    name="product_version"
                    value={version}
                    checked={formData.product_version === version}
                    onChange={handleInputChange}
                    disabled={isLoading}
                  />
                  <div className={sharedStyles.pricingCard}>
                    <div className={sharedStyles.pricingHeader}>
                      <h4>{info.name}</h4>
                      <span className={sharedStyles.price}>{info.price}</span>
                    </div>
                    <p className={sharedStyles.pricingDescription}>{info.description}</p>
                  </div>
                </label>
              ))}
              
              {showLargerOptions && Object.entries(largerPricing).map(([version, info]) => (
                <label key={version} className={sharedStyles.pricingOption}>
                  <input
                    type="radio"
                    name="product_version"
                    value={version}
                    checked={formData.product_version === version}
                    onChange={handleInputChange}
                    disabled={isLoading}
                  />
                  <div className={sharedStyles.pricingCard}>
                    <div className={sharedStyles.pricingHeader}>
                      <h4>{info.name}</h4>
                      <span className={sharedStyles.price}>{info.price}</span>
                    </div>
                    <p className={sharedStyles.pricingDescription}>{info.description}</p>
                  </div>
                </label>
              ))}
            </div>
            
            {!showLargerOptions && Object.keys(largerPricing).length > 0 && (
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowLargerOptions(true)}
                  className={sharedStyles.cancelButton}
                  style={{ 
                    background: 'transparent', 
                    border: '1px solid var(--border-color)', 
                    color: 'var(--text-primary)',
                    padding: '0.5rem 1rem'
                  }}
                >
                  Need a larger team?
                </button>
              </div>
            )}
          </div>

          {/* Payment Preview */}
          <div className={sharedStyles.formSection}>
            <h3>
              <FaCreditCard />
              Payment Summary
            </h3>
            <div className={sharedStyles.paymentSummary}>
              <div className={sharedStyles.summaryItem}>
                <span>Camp:</span>
                <span>{formData.name || 'Untitled Camp'}</span>
              </div>
              <div className={sharedStyles.summaryItem}>
                <span>Duration:</span>
                <span>7 days</span>
              </div>
              <div className={sharedStyles.summaryItem}>
                <span>Size:</span>
                <span>{pricing[formData.product_version]?.name}</span>
              </div>
              <div className={`${sharedStyles.summaryItem} ${sharedStyles.total}`}>
                <span>Total:</span>
                <span>{pricing[formData.product_version]?.price}</span>
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className={sharedStyles.message}>
              <FaExclamationTriangle className={sharedStyles.messageIcon} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className={sharedStyles.successMessage}>
              <FaCheckCircle className={sharedStyles.messageIcon} />
              <span>{success}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className={sharedStyles.formActions}>
            <button
              type="button"
              onClick={() => router.back()}
              className={sharedStyles.cancelButton}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={sharedStyles.submitButton}
              disabled={isLoading || !formData.name.trim() || !formData.start_date}
            >
              {isLoading ? (
                <>
                  <FaClock className={sharedStyles.loadingIcon} />
                  Creating Camp...
                </>
              ) : (
                <>
                  <FaCreditCard />
                  Proceed to Payment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateCamp() {
  return (
    <CreateCampClient />
  );
}
