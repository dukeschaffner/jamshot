'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { FaCampground, FaCalendarAlt, FaUsers, FaCreditCard, FaClock, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { campApi } from '../../../lib/api';
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

  // Pricing information
  const pricing = {
    '10_users': { name: 'Up to 10 Users', price: '$49', description: 'Indie-friendly; low-friction' },
    '25_users': { name: 'Up to 25 Users', price: '$99', description: 'School programs, indie pro camps' },
    '50_users': { name: 'Up to 50 Users', price: '$199', description: 'Publisher/label camps' },
    '100_users': { name: 'Up to 100 Users', price: '$299', description: 'Large enterprise writing retreats' }
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
        <div className={styles.authRequired}>
          <FaCampground className={styles.authIcon} />
          <h1>Login Required</h1>
          <p>You need to be logged in to create a songwriting camp.</p>
          <button
            onClick={() => router.push('/login?redirect=/camps/create')}
            className={styles.loginButton}
          >
            Login to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.campCreateContainer}>
      <div className={styles.campFormContainer}>
        <div className={styles.header}>
          <FaCampground className={styles.headerIcon} />
          <h1>Create Songwriting Camp</h1>
          <p>Start your collaborative songwriting journey</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.campForm}>
          {/* Camp Details Section */}
          <div className={styles.formSection}>
            <h3>
              <FaCampground />
              Camp Details
            </h3>

            <div className={styles.formGroup}>
              <label htmlFor="name" className={styles.formLabel}>
                Camp Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={styles.formInput}
                placeholder="e.g., Summer Songwriting Retreat 2025"
                required
                disabled={isLoading}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="start_date" className={styles.formLabel}>
                <FaCalendarAlt />
                Start Date *
              </label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                value={formData.start_date}
                onChange={handleInputChange}
                className={styles.formInput}
                min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                required
                disabled={isLoading}
              />
              <small className={styles.formHelp}>
                Your 7-day camp will start on this date and last exactly one week.
              </small>
            </div>
          </div>

          {/* Product Version Section */}
          <div className={styles.formSection}>
            <h3>
              <FaUsers />
              Camp Size & Pricing
            </h3>

            <div className={styles.pricingOptions}>
              {Object.entries(pricing).map(([version, info]) => (
                <label key={version} className={styles.pricingOption}>
                  <input
                    type="radio"
                    name="product_version"
                    value={version}
                    checked={formData.product_version === version}
                    onChange={handleInputChange}
                    disabled={isLoading}
                  />
                  <div className={styles.pricingCard}>
                    <div className={styles.pricingHeader}>
                      <h4>{info.name}</h4>
                      <span className={styles.price}>{info.price}</span>
                    </div>
                    <p className={styles.pricingDescription}>{info.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Payment Preview */}
          <div className={styles.formSection}>
            <h3>
              <FaCreditCard />
              Payment Summary
            </h3>
            <div className={styles.paymentSummary}>
              <div className={styles.summaryItem}>
                <span>Camp:</span>
                <span>{formData.name || 'Untitled Camp'}</span>
              </div>
              <div className={styles.summaryItem}>
                <span>Duration:</span>
                <span>7 days</span>
              </div>
              <div className={styles.summaryItem}>
                <span>Size:</span>
                <span>{pricing[formData.product_version]?.name}</span>
              </div>
              <div className={`${styles.summaryItem} ${styles.total}`}>
                <span>Total:</span>
                <span>{pricing[formData.product_version]?.price}</span>
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className={styles.message}>
              <FaExclamationTriangle className={styles.messageIcon} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className={styles.successMessage}>
              <FaCheckCircle className={styles.messageIcon} />
              <span>{success}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => router.back()}
              className={styles.cancelButton}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading || !formData.name.trim() || !formData.start_date}
            >
              {isLoading ? (
                <>
                  <FaClock className={styles.loadingIcon} />
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
