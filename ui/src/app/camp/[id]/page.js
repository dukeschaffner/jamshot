'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUser } from '../../../contexts/UserContext';
import { campApi } from '../../../lib/api';
import CustomTabs from '../../../components/CustomTabs';
import LoadingSpinner from '../../../components/LoadingSpinner';
import BeatCard from '../../../components/BeatCard';
import MiniTrack from '../../../components/MiniTrack';
import { 
  FaCampground, FaCalendarAlt, FaUsers, FaCog, FaUserPlus, 
  FaDownload, FaMusic, FaDoorOpen, FaStream, FaBell, FaTimes,
  FaUpload, FaPlus, FaSearch
} from 'react-icons/fa';
import styles from './CampDashboard.module.css';
import sharedStyles from '../../../styles/Dashboard.module.css';
import BeatPoolTab from './components/BeatPoolTab';
import MyRoomTab from './components/MyRoomTab';
import RoomsTab from './components/RoomsTab';
import TracksTab from './components/TracksTab';
import ActivityTab from './components/ActivityTab';
import InviteLinkModal from '../../../components/InviteLinkModal';
import SettingsModal from './components/SettingsModal';

export default function CampDashboard() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: userLoading, refreshUser } = useUser();

  const campId = parseInt(params.id);
  const inviteCode = searchParams.get('code');

  const [camp, setCamp] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('beats');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Fetch camp details - validates invite code first if code parameter exists
  const fetchCampDetails = async () => {
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
      // Check if user is already a member of this camp
      const isAlreadyMember = user?.camps?.some(camp => camp.id === campId);
      
      if (isAlreadyMember) {
        // User is already a member, just remove code from URL and fetch details
        router.replace(`/camp/${campId}`);
        // Continue to fetch details below
      } else {
        // User is not a member, validate the invite code
        try {
          const response = await campApi.validateInviteCode(inviteCode);
          if (response.data.valid) {
            // Successfully joined, refresh user context to update camps array
            await refreshUser();
            // Refresh to show dashboard without code in URL
            router.replace(`/camp/${campId}`);
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

    // Fetch camp details
    try {
      const response = await campApi.getCamp(campId);
      setCamp(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching camp details:', err);
      if (err.response?.status === 403) {
        setError('You do not have access to this camp');
      } else if (err.response?.status === 404) {
        setError('Camp not found');
      } else {
        setError('Failed to load camp details');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campId, isAuthenticated, userLoading, inviteCode]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getUserLimit = () => {
    const limits = {
      '10_users': 10,
      '25_users': 25,
      '50_users': 50,
      '100_users': 100
    };
    return limits[camp?.product_version] || 25;
  };

  const isCampActive = () => {
    if (!camp) return false;
    const now = new Date();
    const startDate = new Date(camp.start_date);
    const endDate = new Date(camp.end_date);
    return now >= startDate && now <= endDate;
  };

  const isCampEnded = () => {
    if (!camp) return false;
    return new Date() > new Date(camp.end_date);
  };

  const isAdmin = () => {
    return camp?.user_role === 'admin';
  };

  const getUserRoom = () => {
    // Find the room the user is assigned to
    return camp?.rooms?.find(room => 
      room.members?.some(member => member.id === user?.id)
    );
  };

  const handleInviteClick = () => {
    setShowInviteModal(true);
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  const handleExportClick = () => {
    // TODO: Implement export functionality
    alert('Export functionality coming soon!');
  };

  if (!isAuthenticated) {
    // Build redirect URL with current path and query params
    const currentPath = `/camp/${campId}`;
    const redirectUrl = inviteCode 
      ? `${currentPath}?code=${encodeURIComponent(inviteCode)}`
      : currentPath;
    
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaCampground className={sharedStyles.errorIcon} />
          <h1>Authentication Required</h1>
          <p>Please log in to view this camp</p>
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

  if (error || !camp) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaCampground className={sharedStyles.errorIcon} />
          <h1>{error || 'Camp Not Found'}</h1>
          <button onClick={() => router.push('/camps')} className={sharedStyles.primaryButton}>
            Back to Camps
          </button>
        </div>
      </div>
    );
  }

  if (isCampEnded()) {
    return (
      <div className={sharedStyles.container}>
        <div className={sharedStyles.error}>
          <FaCampground className={sharedStyles.errorIcon} />
          <h1>This Camp Has Ended</h1>
          <p>The camp ended on {formatDate(camp.end_date)}</p>
          <button onClick={() => router.push('/camps')} className={sharedStyles.primaryButton}>
            Back to Camps
          </button>
        </div>
      </div>
    );
  }

  const userRoom = getUserRoom();

  // Build tabs array
  const tabs = [
    { key: 'beats', label: 'Beat Pool' },
  ];

  // Add user's room tab if they are assigned to a room
  if (userRoom) {
    tabs.push({ key: 'my-room', label: userRoom.name });
  }

  tabs.push(
    { key: 'rooms', label: 'Rooms' },
    { key: 'tracks', label: 'Tracks' },
    { key: 'activity', label: 'Activity' }
  );

  return (
    <div className={sharedStyles.container}>
      {/* Header */}
      <div className={sharedStyles.header}>
        <div className={sharedStyles.headerTop}>
          <div className={sharedStyles.entityInfo}>
            <div className={sharedStyles.entityName}>
              <FaCampground className={styles.campIcon} />
              <h1>{camp.name}</h1>
            </div>
            <div className={sharedStyles.entityMeta}>
              <div className={sharedStyles.metaItem}>
                <FaCalendarAlt />
                <span>{formatDate(camp.start_date)} - {formatDate(camp.end_date)}</span>
              </div>
              <div className={sharedStyles.metaItem}>
                <FaUsers />
                <span>{camp.member_count || 0} / {getUserLimit()} members</span>
              </div>
            </div>
          </div>

          <div className={sharedStyles.headerActions}>
            {isAdmin() && (
              <button 
                onClick={handleSettingsClick}
                className={sharedStyles.iconButton}
                title="Camp Settings"
              >
                <FaCog />
                <span>Settings</span>
              </button>
            )}
            <button 
              onClick={handleInviteClick}
              className={sharedStyles.iconButton}
              title="Invite Users"
            >
              <FaUserPlus />
              <span>Invite</span>
            </button>
            <button 
              onClick={handleExportClick}
              className={sharedStyles.iconButton}
              title="Export Camp"
            >
              <FaDownload />
              <span>Export</span>
            </button>
          </div>
        </div>

        {!isCampActive() && (
          <div className={styles.campStatus}>
            <FaBell />
            <span>Camp starts on {formatDate(camp.start_date)}</span>
          </div>
        )}
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
        {activeTab === 'beats' && <BeatPoolTab camp={camp} isActive={isCampActive()} />}
        {activeTab === 'my-room' && <MyRoomTab camp={camp} room={userRoom} isActive={isCampActive()} />}
        {activeTab === 'rooms' && <RoomsTab camp={camp} isAdmin={isAdmin()} onCampUpdate={fetchCampDetails} />}
        {activeTab === 'tracks' && <TracksTab camp={camp} />}
        {activeTab === 'activity' && <ActivityTab camp={camp} />}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteLinkModal
          title="Invite to Camp"
          entityType="camp"
          entityId={camp.id}
          inviteCode={camp.camp_code}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && isAdmin() && (
        <SettingsModal
          camp={camp}
          onClose={() => setShowSettingsModal(false)}
          onUpdate={(updatedCamp) => {
            setCamp(updatedCamp);
            setShowSettingsModal(false);
          }}
        />
      )}
    </div>
  );
}

