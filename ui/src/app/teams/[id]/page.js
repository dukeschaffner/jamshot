'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { teamApi } from '../../../lib/api';
import CustomTabs from '../../../components/CustomTabs';
import LoadingSpinner from '../../../components/LoadingSpinner';
import InviteLinkModal from '../../../components/InviteLinkModal';
import TeamSettingsModal from '../../../components/TeamSettingsModal';
import UserCard from '../../../components/UserCard';
import TeamTracksTab from './components/TeamTracksTab';
import TeamFoldersTab from './components/TeamFoldersTab';
import FolderView from './components/FolderView';
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
  const { user, isAuthenticated, isLoading: userLoading, refreshUser } = useUser();

  const teamId = parseInt(params.id);
  const inviteCode = searchParams.get('code');
  const folderId = searchParams.get('folderId');

  const [team, setTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('tracks');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState(null);

  // Fetch team details - validates invite code first if code parameter exists
  const fetchTeamDetails = async () => {
    // Wait until user loading is complete
    if (userLoading) {
      return;
    }

    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    // If there's an invite code, check if user is already a member first
    if (inviteCode) {
      // Check if user is already a member of this team
      const isAlreadyMember = user?.teams?.some(team => team.id === teamId);
      
      if (isAlreadyMember) {
        // User is already a member, just remove code from URL and fetch details
        router.replace(`/teams/${teamId}`);
        // Continue to fetch details below
      } else {
        // User is not a member, validate the invite code
        try {
          const response = await teamApi.validateInviteCode(inviteCode);
          if (response.data.valid) {
            // Successfully joined, refresh user context to update teams array
            await refreshUser();
            // Refresh to show dashboard without code in URL
            router.replace(`/teams/${teamId}`);
            return;
          }
        } catch (err) {
          console.error('Error validating invite code:', err);
          setError(err.response?.data?.error || 'Invalid invite code');
          setIsLoading(false);
          return;
        }
      }
    }

    // Fetch team details
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
  }, [teamId, isAuthenticated, userLoading, inviteCode]);

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
    return team?.user_role === 'admin' || team?.user_role === 'owner';
  };

  const isOwner = () => {
    return team?.user_role === 'owner';
  };

  const handleInviteClick = () => {
    setShowInviteModal(true);
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  const handleRemoveMember = async (userId) => {
    try {
      setRemovingMemberId(userId);
      await teamApi.removeMember(teamId, userId);
      // Refresh team details to update members list
      await fetchTeamDetails();
    } catch (error) {
      console.error('Error removing member:', error);
      const errorMessage = error.response?.data?.error || 'Failed to remove member';
      setError(errorMessage);
      // Clear error after 5 seconds
      setTimeout(() => setError(''), 5000);
      throw error; // Re-throw so UserCard can handle it
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleRoleUpdate = async (userId, newRole) => {
    try {
      // Refresh team details to update members list with new role
      await fetchTeamDetails();
    } catch (error) {
      console.error('Error refreshing team after role update:', error);
    }
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

  // If folderId is present, show folder view instead of dashboard
  if (folderId) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.content}>
          <FolderView team={team} folderId={folderId} />
        </div>
      </div>
    );
  }

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
            {(isAdmin() || isOwner()) && (
              <button 
                onClick={handleSettingsClick}
                className={sharedStyles.iconButton}
                title="Team Settings"
              >
                <FaCog />
                <span>Settings</span>
              </button>
            )}
            {(isAdmin() || isOwner()) && (
              <button 
                onClick={handleInviteClick}
                className={sharedStyles.iconButton}
                title="Invite Members"
              >
                <FaUserPlus />
                <span>Invite</span>
              </button>
            )}
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
        {activeTab === 'tracks' && <TeamTracksTab team={team} />}
        {activeTab === 'members' && (
          <div className={sharedStyles.tabContent}>
            {team.members && team.members.length > 0 ? (
              <div className={sharedStyles.memberList}>
                {team.members.map((member) => (
                  <UserCard
                    key={member.id}
                    user={member}
                    role={member.role}
                    entityType="team"
                    entityId={teamId}
                    onRemove={handleRemoveMember}
                    onRoleUpdate={handleRoleUpdate}
                    isRemoving={removingMemberId === member.id}
                    isCurrentUserAdmin={isAdmin()}
                    isCurrentUserOwner={isOwner()}
                  />
                ))}
              </div>
            ) : (
              <div className={sharedStyles.emptyState}>
                <FaUsers className={sharedStyles.emptyIcon} />
                <h3>Members</h3>
                <p>No members yet. Invite users to join your team.</p>
              </div>
            )}
          </div>
        )}
        {activeTab === 'folders' && <TeamFoldersTab team={team} />}
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

      {/* Settings Modal */}
      {showSettingsModal && (isAdmin() || isOwner()) && team && (
        <TeamSettingsModal
          team={team}
          userRole={team.user_role}
          onClose={() => setShowSettingsModal(false)}
          onTeamUpdated={fetchTeamDetails}
        />
      )}
    </div>
  );
}

