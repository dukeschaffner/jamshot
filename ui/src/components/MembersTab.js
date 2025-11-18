'use client';
import { FaUsers } from 'react-icons/fa';
import UserCard from './UserCard';
import sharedStyles from '../styles/Dashboard.module.css';

export default function MembersTab({
  members = [],
  entityType, // 'team' or 'camp'
  entityId,
  onRemove,
  onRoleUpdate,
  removingMemberId,
  isCurrentUserAdmin = false,
  isCurrentUserOwner = false,
  emptyMessage = 'No members yet. Invite users to join.'
}) {
  if (!members || members.length === 0) {
    return (
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.emptyState}>
          <FaUsers className={sharedStyles.emptyIcon} />
          <h3>Members</h3>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={sharedStyles.tabContent}>
      <div className={sharedStyles.memberList}>
        {members.map((member) => (
          <UserCard
            key={member.id}
            user={member}
            role={member.role}
            entityType={entityType}
            entityId={entityId}
            onRemove={onRemove}
            onRoleUpdate={onRoleUpdate}
            isRemoving={removingMemberId === member.id}
            isCurrentUserAdmin={isCurrentUserAdmin}
            isCurrentUserOwner={isCurrentUserOwner}
          />
        ))}
      </div>
    </div>
  );
}

