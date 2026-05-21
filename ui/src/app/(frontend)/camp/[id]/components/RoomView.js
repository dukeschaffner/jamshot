'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { campApi } from '@/lib/api';
import Track from '@/components/Track';
import InfiniteScrollContainer from '@/components/InfiniteScrollContainer';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import CustomTabs from '@/components/CustomTabs';
import MembersTab from '@/components/MembersTab';
import { useToast } from '@/lib/ToastContext';
import { FaArrowLeft, FaDoorOpen, FaMusic, FaUpload, FaTrash } from 'react-icons/fa';
import sharedStyles from '@/styles/Dashboard.module.css';
import styles from '../CampDashboard.module.css';

const TRACKS_PER_PAGE = 5;

function RoomView({ camp, roomId }) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [room, setRoom] = useState(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('tracks');
  const [removingMemberId, setRemovingMemberId] = useState(null);

  // Fetch room details
  const fetchRoom = async () => {
    try {
      setIsLoadingRoom(true);
      const response = await campApi.getCamp(camp.id);
      const foundRoom = response.data.rooms?.find(r => r.id === parseInt(roomId));
      if (foundRoom) {
        setRoom(foundRoom);
      } else {
        // Room not found, redirect back to dashboard
        router.replace(`/camp/${camp.id}`);
      }
    } catch (err) {
      console.error('Error fetching room:', err);
      router.replace(`/camp/${camp.id}`);
    } finally {
      setIsLoadingRoom(false);
    }
  };

  useEffect(() => {
    if (camp?.id && roomId) {
      fetchRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camp?.id, roomId]);

  const fetchTracks = useCallback(async (pageNum) => {
    const response = await campApi.getRoomTracks(camp.id, parseInt(roomId), {
      page: pageNum,
      limit: TRACKS_PER_PAGE
    });
    
    return {
      items: response.data.tracks,
      pagination: response.data.pagination
    };
  }, [camp.id, roomId]);

  const handleTrackExpansion = useCallback((trackId) => {
    setExpandedTrackId(prev => prev === trackId ? null : trackId);
  }, []);

  const renderTrack = useCallback((track, index, tracks) => {
    return (
      <Track
        track={track}
        allTracks={tracks}
        expandedTrackId={expandedTrackId}
        setExpandedTrackId={handleTrackExpansion}
        campContext={{
          campId: camp.id,
          roomId: parseInt(roomId),
          userRole: camp.user_role
        }}
      />
    );
  }, [expandedTrackId, handleTrackExpansion, camp, roomId]);

  const handleBackToDashboard = () => {
    router.push(`/camp/${camp.id}`);
  };

  const isAdmin = () => {
    return camp?.user_role === 'admin' || camp?.user_role === 'owner';
  };

  const isOwner = () => {
    return camp?.user_role === 'owner';
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await campApi.deleteRoom(camp.id, parseInt(roomId));
      showSuccess('Room Deleted', 'The room has been deleted successfully.');
      router.push(`/camp/${camp.id}`);
    } catch (err) {
      console.error('Error deleting room:', err);
      const errorMessage = err.response?.data?.error || 'Failed to delete room';
      showError('Delete Failed', errorMessage);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      setRemovingMemberId(userId);
      await campApi.removeMember(camp.id, userId);
      // Refresh room details
      await fetchRoom();
    } catch (error) {
      console.error('Error removing member:', error);
      const errorMessage = error.response?.data?.error || 'Failed to remove member';
      showError('Remove Failed', errorMessage);
      throw error;
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleRoleUpdate = async (userId, newRole) => {
    try {
      // Refresh room details to update members list with new role
      await fetchRoom();
    } catch (error) {
      console.error('Error refreshing room after role update:', error);
    }
  };

  const handleRoomUpdate = async (userId, newRoomId) => {
    try {
      // Refresh room details to update members list with new room assignment
      await fetchRoom();
    } catch (error) {
      console.error('Error refreshing room after room update:', error);
    }
  };

  if (isLoadingRoom) {
    return (
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.emptyState}>
          <FaDoorOpen className={sharedStyles.emptyIcon} />
          <p>Loading room...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.emptyState}>
          <FaDoorOpen className={sharedStyles.emptyIcon} />
          <h3>Room Not Found</h3>
          <button onClick={handleBackToDashboard} className={sharedStyles.primaryButton}>
            <FaArrowLeft />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const emptyState = (
    <div className={sharedStyles.emptyState}>
      <FaMusic className={sharedStyles.emptyIcon} />
      <h3>No Tracks in This Room</h3>
      <p>This room is empty. Upload tracks to this room to see them here.</p>
      <Link href={`/upload?camp_id=${camp.id}&room_id=${roomId}`} className="pill-btn gradient-btn">
        <FaUpload />
        Upload Track
      </Link>
    </div>
  );

  const tabs = [
    { key: 'tracks', label: 'Tracks' },
    { key: 'members', label: 'Members' }
  ];

  return (
    <div className={sharedStyles.tabContent}>
      {/* Header */}
      <div className={styles.roomViewHeader}>
        <div className={styles.roomViewHeaderLeft}>
          <button 
            onClick={handleBackToDashboard}
            className={styles.backButton}
            title="Back to Dashboard"
          >
            <FaArrowLeft />
          </button>
          <div className={styles.roomViewTitleSection}>
            <div className={styles.roomViewIcon}>
              <FaDoorOpen />
            </div>
            <div>
              <h2 className={styles.roomViewTitle}>{room.name}</h2>
              <p className={styles.roomViewSubtitle}>
                {room.track_count || 0} {Number(room.track_count) === 1 ? 'track' : 'tracks'} • {room.members?.length || 0} {Number(room.members?.length) === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>
        </div>
        <div className={styles.roomViewActions}>
          <Link 
            href={`/upload?camp_id=${camp.id}&room_id=${roomId}`}
            className={sharedStyles.primaryButton}
          >
            <FaUpload />
            Upload Track
          </Link>
          {isAdmin() && (
            <button
              onClick={handleDeleteClick}
              className={styles.deleteButton}
              title="Delete Room"
              disabled={isDeleting}
            >
              <FaTrash />
            </button>
          )}
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
          <InfiniteScrollContainer
            fetchData={fetchTracks}
            renderItem={renderTrack}
            emptyState={emptyState}
            className={sharedStyles.trackList}
            itemsPerPage={TRACKS_PER_PAGE}
            dependencies={[camp.id, roomId]}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            members={room.members}
            entityType="camp"
            entityId={camp.id}
            onRemove={handleRemoveMember}
            onRoleUpdate={handleRoleUpdate}
            removingMemberId={removingMemberId}
            isCurrentUserAdmin={isAdmin()}
            isCurrentUserOwner={isOwner()}
            campRooms={camp.rooms || []}
            onRoomUpdate={handleRoomUpdate}
            emptyMessage="No members in this room yet."
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Room"
        message={`Are you sure you want to delete "${room?.name}"? The room will be deleted, but all tracks will be preserved.`}
        confirmText="Delete Room"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default RoomView;

