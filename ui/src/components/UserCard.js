'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FaTimes } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import { teamApi } from '../lib/api';
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
  isCurrentUserOwner = false // Pass this from parent component for teams
}) {
  const { user: currentUser } = useUser();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isRemovingState, setIsRemovingState] = useState(false);
  const [currentRole, setCurrentRole] = useState(role);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  // Sync role prop changes
  useEffect(() => {
    setCurrentRole(role);
  }, [role]);

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

  const handleRoleChange = async (newRole) => {
    if (newRole === currentRole || entityType !== 'team') {
      setShowRoleDropdown(false);
      return;
    }

    setIsUpdatingRole(true);
    try {
      await teamApi.updateMemberRole(entityId, user.id, newRole);
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

  const getAvailableRoles = () => {
    // Only owners and admins can change roles (for teams)
    if ((!isCurrentUserOwner && !isCurrentUserAdmin) || entityType !== 'team') {
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
    return ['admin', 'contributor', 'viewer'];
  };

  const availableRoles = getAvailableRoles();
  // Filter out current role from available roles (no point showing dropdown if only current role is available)
  const rolesToShow = availableRoles.filter(role => role !== currentRole);
  const canChangeRole = (isCurrentUserOwner || isCurrentUserAdmin) && entityType === 'team' && user.id !== currentUser?.id && currentRole !== 'owner' && rolesToShow.length > 0;

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
    </>
  );
}

