'use client';
import { useState, useEffect } from 'react';
import { FaTimes, FaCheck, FaCrown } from 'react-icons/fa';
import { teamApi } from '../lib/api';
import { TEAM_PLANS, TEAM_PRODUCT_VERSIONS, formatPrice } from '../lib/subscriptionUtils';
import { loadStripe } from '@stripe/stripe-js';
import sharedStyles from '../styles/Dashboard.module.css';
import styles from './TeamSettingsModal.module.css';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Helper function to compare team product versions
const compareTeamVersions = (version1, version2) => {
  const order = [
    TEAM_PRODUCT_VERSIONS.TEN_USERS,
    TEAM_PRODUCT_VERSIONS.TWENTY_FIVE_USERS,
    TEAM_PRODUCT_VERSIONS.FIFTY_USERS,
    TEAM_PRODUCT_VERSIONS.ONE_HUNDRED_USERS,
    TEAM_PRODUCT_VERSIONS.ENTERPRISE
  ];
  const index1 = order.indexOf(version1);
  const index2 = order.indexOf(version2);
  if (index1 === -1 || index2 === -1) return 0;
  return index1 - index2;
};

const isTeamUpgrade = (fromVersion, toVersion) => {
  return compareTeamVersions(toVersion, fromVersion) > 0;
};

const isTeamDowngrade = (fromVersion, toVersion) => {
  return compareTeamVersions(toVersion, fromVersion) < 0;
};

function TeamSettingsModal({ team, onClose, onTeamUpdated }) {
  const [teamName, setTeamName] = useState(team?.name || '');
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [loading, setLoading] = useState({});
  const [message, setMessage] = useState(null);
  const [savingName, setSavingName] = useState(false);

  // Fetch subscription status
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (!team?.id) {
        setStatusLoading(false);
        return;
      }

      try {
        const response = await teamApi.getSubscriptionStatus(team.id);
        setSubscriptionStatus(response.data);
      } catch (error) {
        console.error('Error fetching subscription status:', error);
      } finally {
        setStatusLoading(false);
      }
    };

    fetchSubscriptionStatus();
  }, [team?.id]);

  const handleSaveName = async () => {
    if (!teamName.trim() || teamName === team.name) {
      return;
    }

    setSavingName(true);
    setMessage(null);

    try {
      await teamApi.updateTeam(team.id, { name: teamName.trim() });
      setMessage({ type: 'success', text: 'Team name updated successfully' });
      if (onTeamUpdated) {
        onTeamUpdated();
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error updating team name:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to update team name' });
    } finally {
      setSavingName(false);
    }
  };

  const handleModifySubscription = async (productVersion) => {
    if (!team?.id) return;

    setLoading({ ...loading, [productVersion]: true });
    setMessage(null);

    try {
      const response = await teamApi.modifySubscription(team.id, productVersion);
      const data = response.data;

      // Handle different response types
      if (data.type === 'checkout_session') {
        // Redirect to Stripe Checkout for new subscriptions
        const stripe = await stripePromise;
        const { error } = await stripe.redirectToCheckout({
          sessionId: data.id,
        });

        if (error) {
          throw new Error(error.message);
        }
      } else if (data.type === 'tier_change') {
        // Immediate tier change - show success and refresh data
        setMessage({ type: 'success', text: data.message });
        // Refresh subscription status
        const statusResponse = await teamApi.getSubscriptionStatus(team.id);
        setSubscriptionStatus(statusResponse.data);
        if (onTeamUpdated) {
          onTeamUpdated();
        }
      } else if (data.type === 'reactivation') {
        // Subscription reactivated - show success and refresh data
        setMessage({ type: 'success', text: data.message });
        const statusResponse = await teamApi.getSubscriptionStatus(team.id);
        setSubscriptionStatus(statusResponse.data);
        if (onTeamUpdated) {
          onTeamUpdated();
        }
      } else {
        // Default handling
        setMessage({ type: 'success', text: data.message || 'Subscription updated successfully' });
        const statusResponse = await teamApi.getSubscriptionStatus(team.id);
        setSubscriptionStatus(statusResponse.data);
        if (onTeamUpdated) {
          onTeamUpdated();
        }
      }
    } catch (error) {
      console.error('Error updating subscription:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    } finally {
      setLoading({ ...loading, [productVersion]: false });
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your team subscription? It will remain active until the end of your current billing period.')) {
      return;
    }

    try {
      const response = await teamApi.cancelSubscription(team.id);
      setMessage({ type: 'success', text: response.data.message });
      
      // Refresh subscription status
      const statusResponse = await teamApi.getSubscriptionStatus(team.id);
      setSubscriptionStatus(statusResponse.data);
      if (onTeamUpdated) {
        onTeamUpdated();
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    }
  };

  const getPlanButtonText = (plan) => {
    if (!subscriptionStatus) return 'Loading...';
    
    const currentVersion = subscriptionStatus.product_version;
    const targetVersion = plan.id;
    
    // Handle current plan
    if (currentVersion === targetVersion) {
      if (subscriptionStatus.cancel_at_period_end) {
        return 'Reactivate Subscription';
      }
      return 'Current Plan';
    }
    
    // Handle enterprise plan
    if (targetVersion === TEAM_PRODUCT_VERSIONS.ENTERPRISE) {
      return 'Contact Us';
    }
    
    // Determine upgrade vs downgrade vs switch
    if (isTeamUpgrade(currentVersion, targetVersion)) {
      return `Upgrade to ${plan.name}`;
    } else if (isTeamDowngrade(currentVersion, targetVersion)) {
      return `Switch to ${plan.name}`;
    } else {
      return `Switch to ${plan.name}`;
    }
  };

  const isPlanDisabled = (plan) => {
    if (!subscriptionStatus) return true;
    
    // Current plan is disabled unless it can be reactivated
    const isCurrentPlan = subscriptionStatus.product_version === plan.id;
    if (isCurrentPlan && !subscriptionStatus.cancel_at_period_end) {
      return true;
    }
    
    // Enterprise plan is always available (but requires contact)
    if (plan.id === TEAM_PRODUCT_VERSIONS.ENTERPRISE) {
      return false;
    }
    
    // All other cases allow interaction
    return false;
  };

  const currentPlan = subscriptionStatus 
    ? TEAM_PLANS[subscriptionStatus.product_version] 
    : null;

  return (
    <div className={sharedStyles.modalOverlay} onClick={onClose}>
      <div className={`${sharedStyles.modal} ${styles.modal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Team Settings</h2>
          <button onClick={onClose} className={styles.closeButton}>
            <FaTimes />
          </button>
        </div>

        <div className={styles.modalBody}>
          {message && (
            <div className={`${styles.message} ${styles[message.type]}`}>
              {message.text}
            </div>
          )}

          {/* Team Name Section */}
          <div className={styles.section}>
            <h3>Team Name</h3>
            <div className={styles.nameInputGroup}>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className={styles.nameInput}
                placeholder="Enter team name"
                maxLength={100}
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || !teamName.trim() || teamName === team?.name}
                className={styles.saveButton}
              >
                {savingName ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Subscription Management Section */}
          <div className={styles.section}>
            <h3>Subscription Management</h3>
            
            {statusLoading ? (
              <div className={styles.loading}>Loading subscription status...</div>
            ) : subscriptionStatus && currentPlan ? (
              <>
                <div className={styles.currentStatus}>
                  <div className={styles.statusCard}>
                    <div className={styles.statusInfo}>
                      <span className={styles.currentPlan}>
                        {currentPlan.name}
                      </span>
                      {subscriptionStatus.expires_at && (
                        <span className={styles.expiryDate}>
                          {subscriptionStatus.cancel_at_period_end 
                            ? `Expires: ${new Date(subscriptionStatus.expires_at).toLocaleDateString()}`
                            : `Renews: ${new Date(subscriptionStatus.expires_at).toLocaleDateString()}`
                          }
                        </span>
                      )}
                    </div>
                    {subscriptionStatus.is_active && !subscriptionStatus.cancel_at_period_end && (
                      <button 
                        onClick={handleCancelSubscription}
                        className={styles.cancelButton}
                      >
                        Cancel Subscription
                      </button>
                    )}
                  </div>
                </div>

                <div className={styles.plansGrid}>
                  {Object.values(TEAM_PLANS).map((plan) => (
                    <div 
                      key={plan.id} 
                      className={`${styles.planCard} ${subscriptionStatus.product_version === plan.id ? styles.currentPlan : ''} ${plan.id === TEAM_PRODUCT_VERSIONS.ENTERPRISE ? styles.featured : ''}`}
                    >
                      {plan.id === TEAM_PRODUCT_VERSIONS.ENTERPRISE && (
                        <div className={styles.popularBadge}>
                          <FaCrown /> Enterprise
                        </div>
                      )}
                      
                      <div className={styles.planHeader}>
                        <h4 className={styles.planName}>
                          {plan.name}
                        </h4>
                        <div className={styles.planPrice}>
                          {plan.price === null ? (
                            <span className={styles.customPrice}>Custom</span>
                          ) : (
                            <>
                              <span className={styles.price}>{formatPrice(plan.price)}</span>
                              <span className={styles.period}>/{plan.billing_period}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className={styles.planFeatures}>
                        {plan.highlights.map((highlight, index) => (
                          <div key={index} className={styles.feature}>
                            <FaCheck className={styles.featureCheck} />
                            <span>{highlight}</span>
                          </div>
                        ))}
                      </div>

                      <div className={styles.planFooter}>
                        {plan.id === TEAM_PRODUCT_VERSIONS.ENTERPRISE ? (
                          <a
                            href="/contact"
                            className={`${styles.subscribeButton} ${styles.premiumButton}`}
                          >
                            Contact Us
                          </a>
                        ) : (
                          <button
                            onClick={() => handleModifySubscription(plan.id)}
                            disabled={isPlanDisabled(plan) || loading[plan.id]}
                            className={`${styles.subscribeButton} ${subscriptionStatus.product_version === plan.id ? styles.currentButton : ''}`}
                          >
                            {loading[plan.id] ? 'Processing...' : getPlanButtonText(plan)}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.error}>Unable to load subscription status</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamSettingsModal;

