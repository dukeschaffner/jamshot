'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { teamApi } from '../../../lib/api';
import CustomTabs from '../../../components/CustomTabs';
import LoadingSpinner from '../../../components/LoadingSpinner';
import InviteLinkModal from '../../../components/InviteLinkModal';
import { 
  FaUsers, FaCog, FaUserPlus, FaMusic, FaFolder, FaBell,
  FaExclamationTriangle
} from 'react-icons/fa';
import styles from './TeamDashboard.module.css';
import sharedStyles from '../../../styles/Dashboard.module.css';
import { TEAM_PLANS } from '../../../../shared/utils/subscription';

export default function TeamDashboard() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: userLoading } = useUser();

  const teamId = parseInt(params.id);
  const inviteCode = searchParams.get('code');

  const [team, setTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('tracks');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Handle invite code validation on mount (TODO: implement validate-code endpoint)
  useEffect(() => {
    const validateInvite = async () => {
      // Wait until user loading is complete before validating invite code
      if (inviteCode && isAuthenticated && !userLoading) {
        // TODO: Implement team code validation similar to camps
        // For now, just remove the code from URL
        router.replace(`/teams/${teamId}`);
      }
    };

    validateInvite();
  }, [inviteCode, teamId, isAuthenticated, userLoading, router]);

  // Fetch team details
  const fetchTeamDetails = async () => {
    // Wait until user loading is complete before fetching team details
    if (userLoading) {
      return;
    }

    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await teamApi.getTeam(teamId);
      setTeam(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching team details:', err);
      if (err.response?.status === 403) {
        setError('You do not have access to this team');
      } else if (err.response?.status === 404) {
        setError('Team not found');
      } else {
        setError('Failed to load team details');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, isAuthenticated, userLoading]);

  const getUserLimit = () => {
    if (!team) return 'Unknown';
    const plan = TEAM_PLANS[team.product_version];
    if (!plan) return 'Unknown';
    if (plan.limits.max_users === -1) return 'Unlimited';
    return plan.limits.max_users;
  };

  const getPlanName = () => {
    if (!team) return 'Unknown Plan';
    const plan = TEAM_PLANS[team.product_version];
    return plan ? plan.name : 'Unknown Plan';
  };

  const isActive = () => {
    if (!team) return false;
    return team.subscription_status === 'active' || team.subscription_status === 'trialing';
  };

  const isAdmin = () => {
    return team?.user_role === 'admin';
  };

  const handleInviteClick = () => {
    setShowInviteModal(true);
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  if (!isAuthenticated) {
    // Build redirect URL with current path and query params
    const currentPath = `/teams/${teamId}`;
    const redirectUrl = inviteCode 
      ? `${currentPath}?code=${encodeURIComponent(inviteCode)}`
      : currentPath;
    
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaUsers className={sharedStyles.errorIcon} />
          <h1>Authentication Required</h1>
          <p>Please log in to view this team</p>
          <button onClick={() => router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`)} className={sharedStyles.primaryButton}>
            Log In
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={sharedStyles.container}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaUsers className={sharedStyles.errorIcon} />
          <h1>{error || 'Team Not Found'}</h1>
          <button onClick={() => router.push('/teams/create')} className={sharedStyles.primaryButton}>
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  if (!isActive()) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaUsers className={sharedStyles.errorIcon} />
          <h1>Team Subscription Inactive</h1>
          <p>This team's subscription is not currently active. Please contact the team admin.</p>
          <button onClick={() => router.push('/teams/create')} className={sharedStyles.primaryButton}>
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  const maxUsers = getUserLimit();
  const planName = getPlanName();
  const memberCount = team.members?.length || 0;

  // Build tabs array
  const tabs = [
    { key: 'tracks', label: 'Tracks' },
    { key: 'members', label: 'Members' },
    { key: 'folders', label: 'Folders' }
  ];

  return (
    <div className={sharedStyles.container}>
      {/* Header */}
      <div className={sharedStyles.header}>
        <div className={sharedStyles.headerTop}>
          <div className={sharedStyles.entityInfo}>
            <div className={sharedStyles.entityName}>
              <FaUsers className={styles.teamIcon} />
              <h1>{team.name}</h1>
            </div>
            <div className={sharedStyles.entityMeta}>
              <div className={sharedStyles.metaItem}>
                <FaUsers />
                <span>{memberCount} / {maxUsers === 'Unlimited' ? '∞' : maxUsers} members</span>
              </div>
              <div className={sharedStyles.metaItem}>
                <FaMusic />
                <span>{planName}</span>
              </div>
            </div>
          </div>

          <div className={sharedStyles.headerActions}>
            {isAdmin() && (
              <button 
                onClick={handleSettingsClick}
                className={sharedStyles.iconButton}
                title="Team Settings"
              >
                <FaCog />
                <span>Settings</span>
              </button>
            )}
            <button 
              onClick={handleInviteClick}
              className={sharedStyles.iconButton}
              title="Invite Members"
            >
              <FaUserPlus />
              <span>Invite</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={sharedStyles.tabsContainer}>
        <CustomTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Tab Content */}
      <div className={sharedStyles.content}>
        {activeTab === 'tracks' && (
          <div className={sharedStyles.tabContent}>
            <div className={sharedStyles.emptyState}>
              <FaMusic className={sharedStyles.emptyIcon} />
              <h3>Tracks</h3>
              <p>Team tracks will appear here</p>
            </div>
          </div>
        )}
        {activeTab === 'members' && (
          <div className={sharedStyles.tabContent}>
            <div className={sharedStyles.emptyState}>
              <FaUsers className={sharedStyles.emptyIcon} />
              <h3>Members</h3>
              <p>Team members will appear here</p>
            </div>
          </div>
        )}
        {activeTab === 'folders' && (
          <div className={sharedStyles.tabContent}>
            <div className={sharedStyles.emptyState}>
              <FaFolder className={sharedStyles.emptyIcon} />
              <h3>Folders</h3>
              <p>Team folders will appear here</p>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && team && (
        <InviteLinkModal
          title="Invite to Team"
          entityType="team"
          entityId={team.id}
          inviteCode={team.team_code}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Settings Modal - TODO: Implement */}
      {showSettingsModal && isAdmin() && (
        <div className={sharedStyles.modalOverlay} onClick={() => setShowSettingsModal(false)}>
          <div className={sharedStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Team Settings</h2>
            <p>Settings modal coming soon</p>
            <button onClick={() => setShowSettingsModal(false)} className={sharedStyles.primaryButton}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

