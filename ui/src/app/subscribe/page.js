'use client';

import { useState, useEffect, Suspense } from 'react';
import { useUser } from '@/contexts/UserContext';
import { SUBSCRIPTION_TIERS, SUBSCRIPTION_PLANS, formatPrice, getTierRank, isUpgrade, isDowngrade } from '@/lib/subscriptionUtils';
import api from '@/lib/api';
import { loadStripe } from '@stripe/stripe-js';
import { FaCheck, FaTimes, FaCrown, FaStar } from 'react-icons/fa';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './Subscribe.module.css';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

function SubscribeContent() {
  const { user, userPlan, refreshUser } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState({});
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Check for success/cancel messages
  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');
  const tier = searchParams.get('tier');

  useEffect(() => {
    if (success === 'true') {
      setMessage({ type: 'success', text: `Successfully subscribed to ${tier}!` });
      // Refresh user data to get updated subscription
      if (refreshUser) refreshUser();
    } else if (canceled === 'true') {
      setMessage({ type: 'error', text: 'Subscription was canceled.' });
    }
  }, [success, canceled, tier, refreshUser]);

  const [message, setMessage] = useState(null);

  // Fetch subscription status
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (!user) {
        setStatusLoading(false);
        return;
      }

      try {
        const response = await api.get('/payments/subscription-status');
        setSubscriptionStatus(response.data);
      } catch (error) {
        console.error('Error fetching subscription status:', error);
      } finally {
        setStatusLoading(false);
      }
    };

    fetchSubscriptionStatus();
  }, [user]);

  const handleSubscribe = async (planTier) => {
    if (!user) {
      router.push('/login?redirect=/subscribe');
      return;
    }

    setLoading({ ...loading, [planTier]: true });
    setMessage(null);

    try {
      // Determine if user has existing subscription
      const hasExistingSubscription = user.stripe_subscription_id && subscriptionStatus?.is_active && !subscriptionStatus?.cancel_at_period_end;
      
      let response;
      if (hasExistingSubscription || planTier === SUBSCRIPTION_TIERS.FREE) {
        // Use modify endpoint for tier changes or downgrades to free
        response = await api.post('/payments/modify-subscription', { tier: planTier });
      } else {
        // Use create endpoint for new subscriptions
        response = await api.post('/payments/create-subscription-session', { tier: planTier });
      }

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
        // Immediate tier change - show success and refresh
        setMessage({ type: 'success', text: data.message });
        if (refreshUser) refreshUser();
        
        // Refresh subscription status
        const statusResponse = await api.get('/payments/subscription-status');
        setSubscriptionStatus(statusResponse.data);
      } else if (data.type === 'reactivation') {
        // Subscription reactivated - show success and refresh
        setMessage({ type: 'success', text: data.message });
        if (refreshUser) refreshUser();
        
        // Refresh subscription status
        const statusResponse = await api.get('/payments/subscription-status');
        setSubscriptionStatus(statusResponse.data);
      } else if (data.type === 'downgrade_to_free') {
        // Downgrade to free - show message about end of period
        setMessage({ type: 'info', text: data.message });
        
        // Refresh subscription status to show cancellation
        const statusResponse = await api.get('/payments/subscription-status');
        setSubscriptionStatus(statusResponse.data);
      } else {
        // Default handling for backward compatibility
        setMessage({ type: 'success', text: data.message || 'Subscription updated successfully' });
        if (refreshUser) refreshUser();
      }
    } catch (error) {
      console.error('Error updating subscription:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    } finally {
      setLoading({ ...loading, [planTier]: false });
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? It will remain active until the end of your current billing period.')) {
      return;
    }

    try {
      const response = await api.post('/payments/cancel-subscription');
      setMessage({ type: 'success', text: response.data.message });
      
      // Refresh subscription status
      const statusResponse = await api.get('/payments/subscription-status');
      setSubscriptionStatus(statusResponse.data);
    } catch (error) {
      console.error('Error canceling subscription:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    }
  };

  const renderFeatureIcon = (hasFeature) => {
    return hasFeature ? (
      <FaCheck className={styles.checkIcon} />
    ) : (
      <FaTimes className={styles.crossIcon} />
    );
  };

  const getPlanButtonText = (plan) => {
    if (!user) return 'Sign Up to Subscribe';
    
    const currentTier = userPlan.id;
    const targetTier = plan.id;
    
    // Handle current plan
    if (currentTier === targetTier) {
      if (subscriptionStatus?.cancel_at_period_end) {
        return 'Reactivate Subscription';
      }
      return 'Current Plan';
    }
    
    // Handle free tier
    if (targetTier === SUBSCRIPTION_TIERS.FREE) {
      if (currentTier === SUBSCRIPTION_TIERS.FREE) {
        return 'Free Forever';
      }
      return 'Downgrade to Free';
    }
    
    // Handle paid tier changes
    if (currentTier === SUBSCRIPTION_TIERS.FREE) {
      return `Subscribe for ${formatPrice(plan.price)}/month`;
    }
    
    // Determine upgrade vs downgrade vs switch
    if (isUpgrade(currentTier, targetTier)) {
      return `Upgrade to ${plan.name}`;
    } else if (isDowngrade(currentTier, targetTier)) {
      return `Switch to ${plan.name}`;
    } else {
      return `Switch to ${plan.name}`;
    }
  };

  const isPlanDisabled = (plan) => {
    // Non-authenticated users can only see free tier
    if (!user && plan.id !== SUBSCRIPTION_TIERS.FREE) return false;
    
    // Current plan is disabled unless it can be reactivated
    const isCurrentPlan = userPlan.id === plan.id;
    if (isCurrentPlan && !subscriptionStatus?.cancel_at_period_end) {
      return true;
    }
    
    // Free tier button is never disabled for authenticated users
    if (plan.id === SUBSCRIPTION_TIERS.FREE) {
      return false;
    }
    
    // All other cases allow interaction
    return false;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Choose Your Plan</h1>
        <p className={styles.subtitle}>
          Unlock more features and support the development of Sterio
        </p>
      </div>

      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}

      {user && subscriptionStatus && (
        <div className={styles.currentStatus}>
          <h3>Current Subscription Status</h3>
          <div className={styles.statusCard}>
            <div className={styles.statusInfo}>
              <span className={styles.currentTier}>
                {userPlan.name} Plan
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
            {userPlan.id !== SUBSCRIPTION_TIERS.FREE && subscriptionStatus.is_active && !subscriptionStatus.cancel_at_period_end && (
              <button 
                onClick={handleCancelSubscription}
                className={styles.cancelButton}
              >
                Cancel Subscription
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.plansGrid}>
        {Object.values(SUBSCRIPTION_PLANS).map((plan) => (
          <div 
            key={plan.id} 
            className={`${styles.planCard} ${userPlan.id === plan.id ? styles.currentPlan : ''} ${plan.id === SUBSCRIPTION_TIERS.PREMIUM ? styles.featured : ''}`}
          >
            {plan.id === SUBSCRIPTION_TIERS.PREMIUM && (
              <div className={styles.popularBadge}>
                <FaCrown /> Most Popular
              </div>
            )}
            
            <div className={styles.planHeader}>
              <h3 className={styles.planName}>
                {plan.name}
                {plan.id === SUBSCRIPTION_TIERS.PREMIUM && <FaStar className={styles.starIcon} />}
              </h3>
              <div className={styles.planPrice}>
                {plan.price === 0 ? (
                  <span className={styles.freePrice}>Free</span>
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
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={isPlanDisabled(plan) || loading[plan.id]}
                className={`${styles.subscribeButton} ${userPlan.id === plan.id ? styles.currentButton : ''} ${plan.id === SUBSCRIPTION_TIERS.PREMIUM ? styles.premiumButton : ''}`}
              >
                {loading[plan.id] ? 'Processing...' : getPlanButtonText(plan)}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.faq}>
        <h2>Frequently Asked Questions</h2>
        <div className={styles.faqList}>
          <div className={styles.faqItem}>
            <h4>Can I change my plan anytime?</h4>
            <p>Yes! You can upgrade, downgrade, or switch between plans at any time. Upgrades take effect immediately with prorated billing, while downgrades to the free tier take effect at the end of your current billing period.</p>
          </div>
          <div className={styles.faqItem}>
            <h4>How does billing work when I change plans?</h4>
            <p>When upgrading or switching between paid plans, you&apos;ll be charged prorated amounts immediately. When downgrading to free, your paid plan continues until the end of your billing period.</p>
          </div>
          <div className={styles.faqItem}>
            <h4>What happens to my content if I downgrade?</h4>
            <p>Your existing content will remain accessible, but you&apos;ll be limited by the features of your new plan for future uploads.</p>
          </div>
          <div className={styles.faqItem}>
            <h4>Is there a free trial?</h4>
            <p>The Free plan lets you explore Sterio&apos;s core features. You can upgrade to a paid plan anytime to unlock additional features.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Subscribe() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SubscribeContent />
    </Suspense>
  );
} 