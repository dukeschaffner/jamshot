'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FaTimes } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import { teamApi, campApi } from '../lib/api';
import ConfirmationDialog from './ConfirmationDialog';
import styles from './UserCard.module.css';

export default function UserCard({
  user,
  role,
  entityType, // 'team' or 'camp'
  entityId,
  onRemove,
  onRoleUpdate,
  isRemoving = false,
  isCurrentUserAdmin = false, // Pass this from parent component
  isCurrentUserOwner = false, // Pass this from parent component for teams
  currentRoomId = null, // Room ID the user is currently assigned to (camp only)
  onRoomUpdate, // Callback for when room is updated (camp only)
  campRooms = [] // Array of available rooms (camp only)
}) {
  const { user: currentUser } = useUser();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isRemovingState, setIsRemovingState] = useState(false);
  const [currentRole, setCurrentRole] = useState(role);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [currentRoomIdState, setCurrentRoomIdState] = useState(currentRoomId);
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);

  // Sync role prop changes
  useEffect(() => {
    setCurrentRole(role);
  }, [role]);

  // Sync room prop changes
  useEffect(() => {
    setCurrentRoomIdState(currentRoomId);
  }, [currentRoomId]);

  const handleRemoveClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmRemove = async () => {
    setIsRemovingState(true);
    try {
      await onRemove(user.id);
      setShowConfirmDialog(false);
    } catch (error) {
      console.error('Error removing member:', error);
      // Error handling is done by parent component
    } finally {
      setIsRemovingState(false);
    }
  };

  const getRoleDisplay = (role) => {
    const roleMap = {
      owner: 'Owner',
      admin: 'Admin',
      contributor: 'Contributor',
      viewer: 'Viewer'
    };
    return roleMap[role] || role;
  };

  const getRoleClass = (role) => {
    const roleClassMap = {
      owner: styles.roleOwner,
      admin: styles.roleAdmin,
      contributor: styles.roleContributor,
      viewer: styles.roleViewer
    };
    return roleClassMap[role] || '';
  };

  const getCurrentRoom = () => {
    if (!currentRoomIdState || !campRooms.length) return null;
    return campRooms.find(room => room.id === currentRoomIdState);
  };

  const getRoomDisplay = (roomId) => {
    if (!roomId) return 'No Room';
    const room = campRooms.find(r => r.id === roomId);
    return room ? room.name : 'Unknown Room';
  };

  const getRoomClass = (roomId) => {
    return styles.roomBadge;
  };

  const handleRoleChange = async (newRole) => {
    if (newRole === currentRole || (entityType !== 'team' && entityType !== 'camp')) {
      setShowRoleDropdown(false);
      return;
    }

    setIsUpdatingRole(true);
    try {
      if (entityType === 'team') {
        await teamApi.updateMemberRole(entityId, user.id, newRole);
      } else if (entityType === 'camp') {
        await campApi.updateMemberRole(entityId, user.id, newRole);
      }
      setCurrentRole(newRole);
      setShowRoleDropdown(false);
      if (onRoleUpdate) {
        onRoleUpdate(user.id, newRole);
      }
    } catch (error) {
      console.error('Error updating role:', error);
      const errorMessage = error.response?.data?.error || 'Failed to update role';
      alert(errorMessage);
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleRoomChange = async (newRoomId) => {
    if (newRoomId === currentRoomIdState || entityType !== 'camp') {
      setShowRoomDropdown(false);
      return;
    }

    setIsUpdatingRoom(true);
    try {
      // If user is currently in a room and switching to a different room, remove from old room first
      if (currentRoomIdState && newRoomId && currentRoomIdState !== newRoomId) {
        await campApi.addUserToRoom(entityId, currentRoomIdState, { 
          user_id: user.id, 
          action: 'remove' 
        });
      }

      if (newRoomId) {
        // Assign user to a room
        await campApi.addUserToRoom(entityId, newRoomId, { 
          user_id: user.id, 
          action: 'add' 
        });
      } else if (currentRoomIdState) {
        // Remove user from current room (going to "No Room")
        await campApi.addUserToRoom(entityId, currentRoomIdState, { 
          user_id: user.id, 
          action: 'remove' 
        });
      }
      setCurrentRoomIdState(newRoomId);
      setShowRoomDropdown(false);
      if (onRoomUpdate) {
        onRoomUpdate(user.id, newRoomId);
      }
    } catch (error) {
      console.error('Error updating room assignment:', error);
      const errorMessage = error.response?.data?.error || 'Failed to update room assignment';
      alert(errorMessage);
    } finally {
      setIsUpdatingRoom(false);
    }
  };

  const getAvailableRoles = () => {
    // Only owners and admins can change roles (for teams and camps)
    if ((!isCurrentUserOwner && !isCurrentUserAdmin) || (entityType !== 'team' && entityType !== 'camp')) {
      return [];
    }

    // Cannot change your own role
    if (user.id === currentUser?.id) {
      return [];
    }

    // Cannot change owner role
    if (currentRole === 'owner') {
      return [];
    }

    // If current user is admin (not owner) and current role is admin, cannot change
    if (!isCurrentUserOwner && isCurrentUserAdmin && currentRole === 'admin') {
      return []; // Admins cannot demote other admins
    }

    // Owners can change any role to any role (except owner)
    // Admins can change any role to any role (except demoting admins)
    return ['admin', 'contributor'];
  };

  const getAvailableRooms = () => {
    // Only admins and owners can assign rooms (camp only)
    if ((!isCurrentUserOwner && !isCurrentUserAdmin) || entityType !== 'camp') {
      return [];
    }

    // Return all available rooms (excluding current room)
    return campRooms.filter(room => room.id !== currentRoomIdState);
  };

  const availableRoles = getAvailableRoles();
  // Filter out current role from available roles (no point showing dropdown if only current role is available)
  const rolesToShow = availableRoles.filter(role => role !== currentRole);
  const canChangeRole = (isCurrentUserOwner || isCurrentUserAdmin) && (entityType === 'team' || entityType === 'camp') && user.id !== currentUser?.id && currentRole !== 'owner' && rolesToShow.length > 0;

  const availableRooms = getAvailableRooms();
  // Allow room change if: user has permission AND (there are other rooms available OR user is already in a room and can select "No Room")
  // Admins and owners can change their own room, so we don't restrict self-assignment
  const canChangeRoom = (isCurrentUserOwner || isCurrentUserAdmin) && entityType === 'camp' && (availableRooms.length > 0 || currentRoomIdState !== null);

  return (
    <>
      <div className={styles.userCard}>
        <Link href={`/user/${user.username}`} className={styles.userLink}>
          <Image
            className={styles.avatar}
            src={user.profile_pic_url || '/avatar.svg'}
            alt={user.username}
            width={48}
            height={48}
          />
          <div className={styles.userInfo}>
            <div className={styles.userName}>
              {user.name || user.username}
            </div>
            <div className={styles.userHandle}>
              @{user.username}
            </div>
          </div>
        </Link>
        <div className={styles.cardActions}>
          {/* Room selector for camp variant */}
          {entityType === 'camp' && (
            <>
              {canChangeRoom ? (
                <div className={styles.roomDropdownContainer}>
                  <button
                    className={`${styles.roomBadge} ${styles.roomDropdownButton}`}
                    onClick={() => setShowRoomDropdown(!showRoomDropdown)}
                    disabled={isUpdatingRoom}
                    title="Assign to room"
                  >
                    {getRoomDisplay(currentRoomIdState)}
                    {isUpdatingRoom ? '...' : ' ▼'}
                  </button>
                  {showRoomDropdown && (
                    <div className={styles.roomDropdown}>
                      {/* Only show "No Room" option if user is already in a room */}
                      {currentRoomIdState !== null && (
                        <button
                          className={styles.roomDropdownItem}
                          onClick={() => handleRoomChange(null)}
                          disabled={isUpdatingRoom}
                        >
                          No Room
                        </button>
                      )}
                      {availableRooms.map((room) => (
                        <button
                          key={room.id}
                          className={styles.roomDropdownItem}
                          onClick={() => handleRoomChange(room.id)}
                          disabled={isUpdatingRoom}
                        >
                          {room.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className={`${styles.roomBadge} ${getRoomClass(currentRoomIdState)}`}>
                  {getRoomDisplay(currentRoomIdState)}
                </span>
              )}
            </>
          )}

          {canChangeRole ? (
            <div className={styles.roleDropdownContainer}>
              <button
                className={`${styles.roleBadge} ${styles.roleDropdownButton} ${getRoleClass(currentRole)}`}
                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                disabled={isUpdatingRole}
                title="Change role"
              >
                {getRoleDisplay(currentRole)}
                {isUpdatingRole ? '...' : ' ▼'}
              </button>
              {showRoleDropdown && (
                <div className={styles.roleDropdown}>
                  {rolesToShow.map((availableRole) => (
                    <button
                      key={availableRole}
                      className={styles.roleDropdownItem}
                      onClick={() => handleRoleChange(availableRole)}
                      disabled={isUpdatingRole}
                    >
                      {getRoleDisplay(availableRole)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className={`${styles.roleBadge} ${getRoleClass(currentRole)}`}>
              {getRoleDisplay(currentRole)}
            </span>
          )}

          {(isCurrentUserAdmin || isCurrentUserOwner) &&
           user.id !== currentUser?.id &&
           currentRole !== 'owner' &&
           !(isCurrentUserAdmin && !isCurrentUserOwner && currentRole === 'admin') && (
            <button
              onClick={handleRemoveClick}
              className={styles.removeButton}
              disabled={isRemoving || isRemovingState}
              title={`Remove ${user.name || user.username} from ${entityType}`}
            >
              <FaTimes />
            </button>
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmRemove}
        title={`Remove ${user.name || user.username}?`}
        message={`Are you sure you want to remove ${user.name || user.username} (@${user.username}) from this ${entityType}? This action cannot be undone.`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
      />
      {showRoleDropdown && (
        <div
          className={styles.roleDropdownOverlay}
          onClick={() => setShowRoleDropdown(false)}
        />
      )}
      {showRoomDropdown && (
        <div
          className={styles.roomDropdownOverlay}
          onClick={() => setShowRoomDropdown(false)}
        />
      )}
    </>
  );
}

