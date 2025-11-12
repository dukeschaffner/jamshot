'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { FaUsers, FaCreditCard, FaClock, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { teamApi } from '../../../lib/api';
import { TEAM_PLANS, TEAM_PRODUCT_VERSIONS, formatPrice } from '../../../../shared/utils/subscription';
import sharedStyles from '../../../styles/SharedForm.module.css';
import styles from './TeamCreate.module.css';

function CreateTeamClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useUser();

  // Helper to validate team product version
  const isValidTeamProductVersion = (version) => {
    return Object.values(TEAM_PRODUCT_VERSIONS).includes(version);
  };

  // Get plan version from URL query parameter, default to 25_users
  const planFromUrl = searchParams.get('plan');
  const defaultPlanVersion = planFromUrl && isValidTeamProductVersion(planFromUrl) && planFromUrl !== TEAM_PRODUCT_VERSIONS.ENTERPRISE
    ? planFromUrl
    : '25_users';

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    product_version: defaultPlanVersion
  });

  // Update product_version if plan query param changes
  useEffect(() => {
    if (planFromUrl && isValidTeamProductVersion(planFromUrl) && planFromUrl !== TEAM_PRODUCT_VERSIONS.ENTERPRISE) {
      setFormData(prev => ({
        ...prev,
        product_version: planFromUrl
      }));
    }
  }, [planFromUrl]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Get available team plans (exclude enterprise as it requires custom pricing)
  const availablePlans = useMemo(() => {
    return Object.entries(TEAM_PLANS)
      .filter(([version]) => version !== TEAM_PRODUCT_VERSIONS.ENTERPRISE)
      .map(([version, plan]) => ({
        version,
        ...plan,
        formattedPrice: formatPrice(plan.price),
        uploadLimitText: plan.limits.daily_uploads === -1 
          ? 'Unlimited uploads'
          : `${plan.limits.daily_uploads}/day, ${plan.limits.max_total_uploads === -1 ? 'unlimited' : plan.limits.max_total_uploads.toLocaleString()} total`
      }));
  }, []);

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
        throw new Error('Team name is required');
      }

      // Create team checkout session
      const response = await teamApi.createTeam({
        name: formData.name,
        product_version: formData.product_version
      });

      if (response.data.sessionId && response.data.url) {
        // Redirect to Stripe checkout
        window.location.href = response.data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err) {
      console.error('Error creating team:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create team. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.teamCreateContainer}>
        <div className={sharedStyles.authRequired}>
          <FaUsers className={sharedStyles.authIcon} />
          <h1>Login Required</h1>
          <p>You need to be logged in to create a team.</p>
          <button
            onClick={() => router.push('/login?redirect=/teams/create')}
            className={sharedStyles.loginButton}
          >
            Login to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.teamCreateContainer}>
      <div className={sharedStyles.formContainer}>
        <div className={sharedStyles.formHeader}>
          <FaUsers className={sharedStyles.formHeaderIcon} />
          <h1>Create Team</h1>
          <p>Start collaborating with your team</p>
        </div>

        <form onSubmit={handleSubmit} className={sharedStyles.form}>
          {/* Team Details Section */}
          <div className={sharedStyles.formSection}>
            <h3>
              <FaUsers />
              Team Details
            </h3>

            <div className={sharedStyles.formGroup}>
              <label htmlFor="name" className={sharedStyles.formLabel}>
                Team Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={sharedStyles.formInput}
                placeholder="e.g., Acme Studios"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Product Version Section */}
          <div className={sharedStyles.formSection}>
            <h3>
              <FaUsers />
              Team Size & Pricing
            </h3>

            <div className={sharedStyles.pricingOptions}>
              {availablePlans.map((plan) => (
                <label key={plan.version} className={sharedStyles.pricingOption}>
                  <input
                    type="radio"
                    name="product_version"
                    value={plan.version}
                    checked={formData.product_version === plan.version}
                    onChange={handleInputChange}
                    disabled={isLoading}
                  />
                  <div className={sharedStyles.pricingCard}>
                    <div className={sharedStyles.pricingHeader}>
                      <h4>{plan.name}</h4>
                      <span className={sharedStyles.price}>{plan.formattedPrice}</span>
                    </div>
                    <div className={sharedStyles.pricingDescription}>
                      {plan.highlights && plan.highlights.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: '1.6', listStyleType: 'disc' }}>
                          {plan.highlights.map((highlight, idx) => (
                            <li key={idx} style={{ marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>{highlight}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Payment Preview */}
          <div className={sharedStyles.formSection}>
            <h3>
              <FaCreditCard />
              Payment Summary
            </h3>
            <div className={sharedStyles.paymentSummary}>
              <div className={sharedStyles.summaryItem}>
                <span>Team:</span>
                <span>{formData.name || 'Untitled Team'}</span>
              </div>
              <div className={sharedStyles.summaryItem}>
                <span>Plan:</span>
                <span>{TEAM_PLANS[formData.product_version]?.name || 'Unknown Plan'}</span>
              </div>
              <div className={`${sharedStyles.summaryItem} ${sharedStyles.total}`}>
                <span>Monthly Total:</span>
                <span>{TEAM_PLANS[formData.product_version] ? formatPrice(TEAM_PLANS[formData.product_version].price) + '/month' : 'N/A'}</span>
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
              disabled={isLoading || !formData.name.trim()}
            >
              {isLoading ? (
                <>
                  <FaClock className={sharedStyles.loadingIcon} />
                  Creating Team...
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

export default function CreateTeam() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
      <CreateTeamClient />
    </Suspense>
  );
}

