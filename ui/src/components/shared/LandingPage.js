'use client';
import { useRouter } from 'next/navigation';
import { useRef, useEffect } from 'react';
import Image from 'next/image';
import { FaCheckCircle, FaArrowRight } from 'react-icons/fa';
import { useUser } from '../../contexts/UserContext';
import { TEAM_PLANS, TEAM_PRODUCT_VERSIONS, formatPrice } from '../../../shared/utils/subscription';
import styles from './LandingPage.module.css';

export default function LandingPage({
  title,
  icon: Icon,
  subtitle,
  ctaText,
  createRoute,
  showBackButton = false,
  onBack,
  features,
  screenshots,
  planFilter = (plans) => plans.filter(([version]) => version !== TEAM_PRODUCT_VERSIONS.ENTERPRISE),
  customPlans = null, // If provided, use these instead of TEAM_PLANS
  pricePeriod = '/month' // Default to monthly, can be overridden (e.g., 'one-time')
}) {
  const router = useRouter();
  const { isAuthenticated } = useUser();

  const isAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const handleCreate = () => {
    if (isAuthenticatedRef.current) {
      router.push(createRoute);
    } else {
      router.push(`/login?redirect=${encodeURIComponent(createRoute)}`);
    }
  };

  // Get available plans - use custom plans if provided, otherwise use TEAM_PLANS
  const availablePlans = customPlans 
    ? customPlans.map((plan) => ({
        ...plan,
        formattedPrice: typeof plan.price === 'string' ? plan.price : formatPrice(plan.price),
      }))
    : planFilter(Object.entries(TEAM_PLANS))
        .map(([version, plan]) => ({
          version,
          ...plan,
          formattedPrice: formatPrice(plan.price),
        }));

  return (
    <div className={styles.landingContainer}>
      {showBackButton && onBack && (
        <button onClick={onBack} className={styles.backButton}>
          ← Back
        </button>
      )}

      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroIcon}>
          <Icon />
        </div>
        <h1 className={styles.heroTitle}>{title}</h1>
        <p className={styles.heroSubtitle}>
          {subtitle}
        </p>
        <button onClick={handleCreate} className={styles.ctaButton}>
          {ctaText}
          <FaArrowRight />
        </button>
      </div>

      {/* Features Section */}
      {features && features.length > 0 && (
        <div className={styles.featuresSection}>
          <h2 className={styles.sectionTitle}>Everything You Need to Collaborate</h2>
          <div className={styles.featuresGrid}>
            {features.map((feature, idx) => (
              <div key={idx} className={styles.featureCard}>
                <div className={styles.featureIcon}>{feature.icon}</div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureDescription}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How It Works Section */}
      {screenshots && screenshots.length > 0 && (
        <div className={styles.howItWorksSection}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <p className={styles.sectionSubtitle}>Organize your tracks and collaborate seamlessly</p>
          <div className={styles.screenshotsContainer}>
            {screenshots.map((screenshot, idx) => (
              <div key={idx} className={styles.screenshotCard}>
                <Image
                  src={screenshot.image}
                  alt={screenshot.alt}
                  className={styles.screenshot}
                  width={800}
                  height={600}
                />
                <div className={styles.screenshotCaption}>
                  <h3 className={styles.screenshotTitle}>{screenshot.title}</h3>
                  <p className={styles.screenshotDescription}>
                    {screenshot.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing Section */}
      {availablePlans.length > 0 && (
        <div className={styles.pricingSection}>
          <h2 className={styles.sectionTitle}>Simple, Transparent Pricing</h2>
          <p className={styles.sectionSubtitle}>
            {pricePeriod === 'one-time' 
              ? 'Choose the camp size that fits your needs' 
              : 'Choose the plan that fits your needs'}
          </p>
          <div className={styles.pricingGrid}>
            {availablePlans.map((plan) => (
              <div key={plan.version} className={styles.pricingCard}>
                <div className={styles.pricingHeader}>
                  <h3 className={styles.pricingName}>{plan.name}</h3>
                  <div className={styles.pricingPrice}>
                    <span className={styles.priceAmount}>{plan.formattedPrice}</span>
                    {pricePeriod && <span className={styles.pricePeriod}>{pricePeriod}</span>}
                  </div>
                </div>
                <div className={styles.pricingFeatures}>
                  {plan.highlights.map((highlight, idx) => (
                    <div key={idx} className={styles.pricingFeature}>
                      <FaCheckCircle className={styles.checkIcon} />
                      <span>{highlight}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => router.push(`${createRoute}?plan=${plan.version}`)}
                  className={styles.pricingButton}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA Section */}
      <div className={styles.finalCta}>
        <h2 className={styles.ctaTitle}>Ready to Get Started?</h2>
        <p className={styles.ctaSubtitle}>Create your {title.toLowerCase()} today and start collaborating</p>
        <button onClick={handleCreate} className={styles.ctaButton}>
          {ctaText}
          <FaArrowRight />
        </button>
      </div>
    </div>
  );
}

