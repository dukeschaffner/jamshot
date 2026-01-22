'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { FaCheckCircle, FaUsers, FaExclamationTriangle, FaUserPlus, FaFolder, FaMusic, FaRocket, FaLink, FaShareAlt } from 'react-icons/fa';
import { teamApi } from '../../../lib/api';
import { TEAM_PLANS } from '@sterio/subscription-utils';
import styles from './TeamCreated.module.css';
import sharedStyles from '../../../styles/SuccessPage.module.css';

function TeamCreatedClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useUser();

  const [team, setTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const fetchTeamDetails = async () => {
      if (!isAuthenticated || !sessionId) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await teamApi.getTeamSuccess(sessionId);
        setTeam(response.data);
      } catch (err) {
        console.error('Error fetching team details:', err);
        if (err.response?.status === 404) {
          setError('Team not found. It may still be processing. Please check back in a few minutes.');
        } else if (err.response?.status === 403) {
          setError('Access denied. Please ensure you completed the checkout.');
        } else {
          setError('Failed to load team details. Please contact support if this persists.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamDetails();
  }, [isAuthenticated, sessionId]);

  const handleViewTeam = () => {
    if (team) {
      router.push(`/team/${team.id}`);
    }
  };

  const handleShareInvite = () => {
    if (team) {
      const inviteUrl = `${window.location.origin}/team/${team.id}?code=${team.team_code}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        // Could add a toast notification here
        alert('Invite link copied to clipboard!');
      });
    }
  };

  const getUserLimit = (productVersion) => {
    const plan = TEAM_PLANS[productVersion];
    if (!plan) return 'Unknown';
    if (plan.limits.max_users === -1) return 'Unlimited';
    return plan.limits.max_users;
  };

  const getPlanName = (productVersion) => {
    const plan = TEAM_PLANS[productVersion];
    return plan ? plan.name : 'Unknown Plan';
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
          <FaUsers className={sharedStyles.loadingIcon} />
          <p>Setting up your team...</p>
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
          <button onClick={() => router.push('/teams/create')} className={sharedStyles.primaryButton}>
            Back to Create Team
          </button>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaExclamationTriangle className={sharedStyles.errorIcon} />
          <h1>Team Not Found</h1>
          <p>Unable to find your team details. Please contact support.</p>
          <button onClick={() => router.push('/teams/create')} className={sharedStyles.primaryButton}>
            Back to Create Team
          </button>
        </div>
      </div>
    );
  }

  const maxUsers = getUserLimit(team.product_version);
  const planName = getPlanName(team.product_version);

  return (
    <div className={sharedStyles.container}>
      <div className={sharedStyles.successCard}>
        <div className={sharedStyles.successHeader}>
          <div className={sharedStyles.successIconWrapper}>
            <FaCheckCircle className={sharedStyles.successIcon} />
          </div>
          <h1>Team Created Successfully!</h1>
          <p>Your team is ready to collaborate</p>
        </div>

        <div className={sharedStyles.detailsSection}>
          <div className={sharedStyles.entityName}>
            <FaUsers />
            <h2>{team.name}</h2>
          </div>

          <div className={sharedStyles.detailsGrid}>
            <div className={sharedStyles.detailItem}>
              <FaUsers className={sharedStyles.detailIcon} />
              <div>
                <strong>Plan</strong>
                <p>{planName}</p>
              </div>
            </div>

            <div className={sharedStyles.detailItem}>
              <FaUsers className={sharedStyles.detailIcon} />
              <div>
                <strong>Capacity</strong>
                <p>Up to {maxUsers} members</p>
              </div>
            </div>

            <div className={sharedStyles.detailItem}>
              <FaMusic className={sharedStyles.detailIcon} />
              <div>
                <strong>Status</strong>
                <p>{team.subscription_status === 'active' ? 'Active' : 'Processing'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={sharedStyles.actions}>
          <button onClick={handleViewTeam} className={sharedStyles.primaryButton}>
            <FaUsers />
            View Team Dashboard
          </button>

          <button onClick={handleShareInvite} className={sharedStyles.secondaryButton}>
            <FaShareAlt />
            Share Invite Link
          </button>
        </div>

        <div className={sharedStyles.inviteSection}>
          <div className={sharedStyles.inviteHeader}>
            <FaLink className={sharedStyles.inviteIcon} />
            <h3>Invite Team Members</h3>
          </div>
          <p>Share this link with collaborators you want to add to your team:</p>
          <div className={sharedStyles.inviteLink}>
            <code>
              {`${window.location.origin}/team/${team.id}?code=${team.team_code}`}
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
            Anyone with this link can join your team. You can also invite specific users from your team dashboard.
          </p>
        </div>

        <div className={sharedStyles.nextSteps}>
          <h3>What&apos;s Next?</h3>
          <div className={sharedStyles.stepsList}>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>1</div>
              <div className={sharedStyles.stepIcon}>
                <FaUserPlus />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Invite Team Members</strong>
                <p>Add collaborators to your team from the team dashboard</p>
              </div>
            </div>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>2</div>
              <div className={sharedStyles.stepIcon}>
                <FaFolder />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Organize with Folders</strong>
                <p>Create folders to organize your team&apos;s tracks</p>
              </div>
            </div>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>3</div>
              <div className={sharedStyles.stepIcon}>
                <FaMusic />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Upload Tracks</strong>
                <p>Start uploading tracks to your team&apos;s shared pool</p>
              </div>
            </div>
            <div className={sharedStyles.step}>
              <div className={sharedStyles.stepNumber}>4</div>
              <div className={sharedStyles.stepIcon}>
                <FaRocket />
              </div>
              <div className={sharedStyles.stepContent}>
                <strong>Start Collaborating</strong>
                <p>Begin working together on your music projects</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamCreated() {
  return (
    <Suspense fallback={
      <div className={sharedStyles.container}>
        <div className={sharedStyles.loading}>
          <FaUsers className={sharedStyles.loadingIcon} />
          <p>Loading...</p>
        </div>
      </div>
    }>
      <TeamCreatedClient />
    </Suspense>
  );
}

