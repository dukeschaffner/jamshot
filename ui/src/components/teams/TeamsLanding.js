'use client';
import { useRouter } from 'next/navigation';
import { useRef, useEffect } from 'react';
import Image from 'next/image';
import { FaUsers, FaFolder, FaLock, FaChartLine, FaCheckCircle, FaArrowRight } from 'react-icons/fa';
import { useUser } from '../../contexts/UserContext';
import { TEAM_PLANS, TEAM_PRODUCT_VERSIONS, formatPrice } from '../../../shared/utils/subscription';
import styles from './TeamsLanding.module.css';

export default function TeamsLanding({ showBackButton = false, onBack }) {
  const router = useRouter();
  const { isAuthenticated } = useUser();

  const isAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const handleCreateTeam = () => {
    if (isAuthenticatedRef.current) {
      router.push('/teams/create');
    } else {
      router.push(`/login?redirect=${encodeURIComponent('/teams/create')}`);
    }
  };

  // Get available team plans (exclude enterprise)
  const availablePlans = Object.entries(TEAM_PLANS)
    .filter(([version]) => version !== TEAM_PRODUCT_VERSIONS.ENTERPRISE)
    .map(([version, plan]) => ({
      version,
      ...plan,
      formattedPrice: formatPrice(plan.price),
    }));

  const features = [
    {
      icon: <FaUsers />,
      title: 'Collaborate with Your Team',
      description: 'Asynchronous and effortless collaboration. Invite team members and work together on tracks in a shared workspace.'
    },
    {
      icon: <FaFolder />,
      title: 'Organize with Folders',
      description: 'Create folders to organize team tracks and keep projects structured.'
    },
    {
      icon: <FaLock />,
      title: 'Private Team Tracks',
      description: 'All team tracks are private by default, visible only to team members.'
    },
    {
      icon: <FaChartLine />,
      title: 'Shared Upload Pool',
      description: 'Team members share upload limits, making collaboration seamless.'
    }
  ];

  return (
    <div className={styles.landingContainer}>
      {showBackButton && onBack && (
        <button onClick={onBack} className={styles.backButton}>
          ← Back to Teams
        </button>
      )}

      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroIcon}>
          <FaUsers />
        </div>
        <h1 className={styles.heroTitle}>Teams</h1>
        <p className={styles.heroSubtitle}>
          Collaborate with your team on music projects. Asynchronous and effortless—share tracks, organize folders, and work together seamlessly.
        </p>
        <button onClick={handleCreateTeam} className={styles.ctaButton}>
          Create Team
          <FaArrowRight />
        </button>
      </div>

      {/* Features Section */}
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

      {/* How It Works Section */}
      <div className={styles.howItWorksSection}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <p className={styles.sectionSubtitle}>Organize your team&apos;s tracks and collaborate seamlessly</p>
        <div className={styles.screenshotsContainer}>
          <div className={styles.screenshotCard}>
            <Image
              src={`${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/team-folders.png`}
              alt="Team folders view showing organized project folders"
              className={styles.screenshot}
              width={800}
              height={600}
            />
            <div className={styles.screenshotCaption}>
              <h3 className={styles.screenshotTitle}>Organize Projects with Folders</h3>
              <p className={styles.screenshotDescription}>
                Create folders to organize your team&apos;s tracks by project, album, or any structure that works for your workflow.
              </p>
            </div>
          </div>
          <div className={styles.screenshotCard}>
            <Image
              src={`${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/team-folder.png`}
              alt="Inside a team folder showing tracks organized within a project"
              className={styles.screenshot}
              width={800}
              height={600}
            />
            <div className={styles.screenshotCaption}>
              <h3 className={styles.screenshotTitle}>View Tracks in Context</h3>
              <p className={styles.screenshotDescription}>
                Open any folder to see all tracks organized within it. Upload tracks directly to folders and keep your projects structured.
              </p>
            </div>
          </div>
          <div className={styles.screenshotCard}>
            <Image
              src={`${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/images/static/DAW-collaboration.png`}
              alt="Simple collaborative DAW interface showing multi-track recording and collaboration"
              className={styles.screenshot}
              width={800}
              height={600}
            />
            <div className={styles.screenshotCaption}>
              <h3 className={styles.screenshotTitle}>Collaborate with the Simple DAW</h3>
              <p className={styles.screenshotDescription}>
                Use our built-in DAW to record, layer tracks, and collaborate asynchronously and effortlessly with your team. Upload audio files or record directly, all within your team workspace.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className={styles.pricingSection}>
        <h2 className={styles.sectionTitle}>Simple, Transparent Pricing</h2>
        <p className={styles.sectionSubtitle}>Choose the plan that fits your team size</p>
        <div className={styles.pricingGrid}>
          {availablePlans.map((plan) => (
            <div key={plan.version} className={styles.pricingCard}>
              <div className={styles.pricingHeader}>
                <h3 className={styles.pricingName}>{plan.name}</h3>
                <div className={styles.pricingPrice}>
                  <span className={styles.priceAmount}>{plan.formattedPrice}</span>
                  <span className={styles.pricePeriod}>/month</span>
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
                onClick={() => router.push(`/teams/create?plan=${plan.version}`)}
                className={styles.pricingButton}
              >
                Get Started
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className={styles.finalCta}>
        <h2 className={styles.ctaTitle}>Ready to Get Started?</h2>
        <p className={styles.ctaSubtitle}>Create your team today and start collaborating</p>
        <button onClick={handleCreateTeam} className={styles.ctaButton}>
          Create Team
          <FaArrowRight />
        </button>
      </div>
    </div>
  );
}

