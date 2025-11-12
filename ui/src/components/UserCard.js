'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FaTimes } from 'react-icons/fa';
import { useUser } from '../contexts/UserContext';
import ConfirmationDialog from './ConfirmationDialog';
import styles from './UserCard.module.css';

export default function UserCard({
  user,
  role,
  entityType, // 'team' or 'camp'
  entityId,
  onRemove,
  isRemoving = false,
  isCurrentUserAdmin = false // Pass this from parent component
}) {
  const { user: currentUser } = useUser();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isRemovingState, setIsRemovingState] = useState(false);

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
      admin: 'Admin',
      contributor: 'Contributor',
      viewer: 'Viewer'
    };
    return roleMap[role] || role;
  };

  const getRoleClass = (role) => {
    const roleClassMap = {
      admin: styles.roleAdmin,
      contributor: styles.roleContributor,
      viewer: styles.roleViewer
    };
    return roleClassMap[role] || '';
  };

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
          <span className={`${styles.roleBadge} ${getRoleClass(role)}`}>
            {getRoleDisplay(role)}
          </span>
          {isCurrentUserAdmin && user.id !== currentUser?.id && (
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
    </>
  );
}

