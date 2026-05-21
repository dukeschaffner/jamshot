'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { FaCheckCircle, FaCampground, FaUsers, FaCalendarAlt, FaLink, FaShareAlt, FaExclamationTriangle, FaMusic, FaUpload, FaUserPlus, FaRocket } from 'react-icons/fa';
import { campApi } from '@/lib/api';
import styles from './CampCreated.module.css';
import sharedStyles from '@/styles/SuccessPage.module.css';

function CampCreatedClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useUser();

  const [camp, setCamp] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const fetchCampDetails = async () => {
      if (!isAuthenticated || !sessionId) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await campApi.getCampSuccess(sessionId);
        setCamp(response.data);
      } catch (err) {
        console.error('Error fetching camp details:', err);
        if (err.response?.status === 404) {
          setError('Camp not found. It may still be processing. Please check back in a few minutes.');
        } else {
          setError('Failed to load camp details. Please contact support if this persists.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchCampDetails();
  }, [isAuthenticated, sessionId]);

  const handleViewCamp = () => {
    if (camp) {
      router.push(`/camp/${camp.id}`);
    }
  };

  const handleShareInvite = () => {
    if (camp) {
      const inviteUrl = `${window.location.origin}/camp/${camp.id}?code=${camp.camp_code}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        // Could add a toast notification here
        alert('Invite link copied to clipboard!');
      });
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!isAuthenticated) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.loading}>Loading...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.loading}>
          <FaCampground className={sharedStyles.loadingIcon} />
          <p>Setting up your camp...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaExclamationTriangle className={sharedStyles.errorIcon} />
          <h1>Payment Processing</h1>
          <p>{error}</p>
          <button onClick={() => router.push('/camps')} className={sharedStyles.primaryButton}>
            Back to Camps
          </button>
        </div>
      </div>
    );
  }

  if (!camp) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaExclamationTriangle className={sharedStyles.errorIcon} />
          <h1>Camp Not Found</h1>
          <p>Unable to find your camp details. Please contact support.</p>
          <button onClick={() => router.push('/camps')} className={sharedStyles.primaryButton}>
            Back to Camps
          </button>
        </div>
      </div>
    );
  }

  const userLimit = {
    '10_users': 10,
    '25_users': 25,
    '50_users': 50,
    '100_users': 100
  };

  const maxUsers = userLimit[camp.product_version] || 25;

  return (
    <div className={sharedStyles.container}>
      <div className={sharedStyles.successCard}>
        <div className={sharedStyles.successHeader}>
          <div className={sharedStyles.successIconWrapper}>
            <FaCheckCircle className={sharedStyles.successIcon} />
          </div>
          <h1>Camp Created Successfully!</h1>
          <p>Your songwriting camp is ready to go</p>
        </div>

        <div className={sharedStyles.detailsSection}>
          <div className={sharedStyles.entityName}>
            <FaCampground />
            <h2>{camp.name}</h2>
          </div>

          <div className={sharedStyles.detailsGrid}>
            <div className={sharedStyles.detailItem}>
              <FaCalendarAlt className={sharedStyles.detailIcon} />
              <div>
                <strong>Start Date</strong>
                <p>{formatDate(camp.start_date)}</p>
              </div>
            </div>

            <div className={sharedStyles.detailItem}>
              <FaUsers className={sharedStyles.detailIcon} />
              <div>
                <strong>Capacity</strong>
                <p>Up to {maxUsers} collaborators</p>
              </div>
            </div>

            <div className={sharedStyles.detailItem}>
              <FaCampground className={sharedStyles.detailIcon} />
              <div>
                <strong>Duration</strong>
                <p>7 days</p>
              </div>
            </div>
          </div>
        </div>

        <div className={sharedStyles.actions}>
          <button onClick={handleViewCamp} className={sharedStyles.primaryButton}>
            <FaCampground />
            View Camp Dashboard
          </button>

          <button onClick={handleShareInvite} className={sharedStyles.secondaryButton}>
            <FaShareAlt />
            Share Invite Link
          </button>
        </div>

        <div className={sharedStyles.inviteSection}>
          <div className={sharedStyles.inviteHeader}>
            <FaLink className={sharedStyles.inviteIcon} />
            <h3>Invite Collaborators</h3>
          </div>
          <p>Share this link with musicians, producers, and writers you want to collaborate with:</p>
          <div className={sharedStyles.inviteLink}>
            <code>
              {`${window.location.origin}/camp/${camp.id}?code=${camp.camp_code}`}
            </code>
            <button
              onClick={handleShareInvite}
              className={sharedStyles.copyButton}
              title="Copy to clipboard"
            >
              <FaShareAlt />
            </button>
          </div>
          <p className={sharedStyles.inviteNote}>
            Anyone with this link can join your camp. You can also invite specific users from your camp dashboard.
          </p>
        </div>

        <div className={sharedStyles.nextSteps}>
          <h3>What&apos;s Next?</h3>
          <div className={sharedStyles.stepsList}>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>1</div>
              <div className={sharedStyles.stepIcon}>
                <FaCampground />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Add Rooms</strong>
                <p>Create focused spaces for different aspects of your project (vocals, beats, production, etc.)</p>
              </div>
            </div>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>2</div>
              <div className={sharedStyles.stepIcon}>
                <FaUpload />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Upload Beats</strong>
                <p>Share your initial beats or backing tracks to get the collaboration started</p>
              </div>
            </div>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>3</div>
              <div className={sharedStyles.stepIcon}>
                <FaUserPlus />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Invite Team</strong>
                <p>Bring in producers, vocalists, and other creatives</p>
              </div>
            </div>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>4</div>
              <div className={sharedStyles.stepIcon}>
                <FaRocket />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Start Creating</strong>
                <p>Once everyone joins, begin layering tracks and building your song together</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CampCreated() {
  return (
    <Suspense fallback={
      <div className={sharedStyles.container}>
        <div className={sharedStyles.loading}>
          <FaCampground className={sharedStyles.loadingIcon} />
          <p>Loading...</p>
        </div>
      </div>
    }>
      <CampCreatedClient />
    </Suspense>
  );
}
