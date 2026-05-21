'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { teamApi } from '@/lib/api';
import FolderCard from './FolderCard';
import CreateFolderModal from './CreateFolderModal';
import { FaFolder, FaPlus } from 'react-icons/fa';
import sharedStyles from '@/styles/Dashboard.module.css';
import styles from '../TeamDashboard.module.css';

function TeamFoldersTab({ team }) {
  const router = useRouter();
  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchFolders = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await teamApi.getFolders(team.id);
      setFolders(response.data.folders || []);
    } catch (err) {
      console.error('Error fetching folders:', err);
      setError(err.response?.data?.error || 'Failed to load folders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (team?.id) {
      fetchFolders();
    }
  }, [team?.id]);

  const handleFolderClick = (folder) => {
    router.push(`/team/${team.id}?folderId=${folder.id}`);
  };

  const handleCreateSuccess = (newFolder) => {
    // Refresh folders list
    fetchFolders();
  };

  const isAdmin = () => {
    return team?.user_role === 'admin' || team?.user_role === 'owner';
  };

  const isContributor = () => {
    return team?.user_role === 'contributor' || team?.user_role === 'admin' || team?.user_role === 'owner';
  };

  if (isLoading) {
    return (
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.emptyState}>
          <FaFolder className={sharedStyles.emptyIcon} />
          <p>Loading folders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.emptyState}>
          <FaFolder className={sharedStyles.emptyIcon} />
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.tabHeader}>
          <h2>Team Folders</h2>
          {isContributor() && (
            <button 
              onClick={() => setShowCreateModal(true)}
              className={sharedStyles.primaryButton}
            >
              <FaPlus />
              Create Folder
            </button>
          )}
        </div>

        {folders.length === 0 ? (
          <div className={sharedStyles.emptyState}>
            <FaFolder className={sharedStyles.emptyIcon} />
            <h3>No Folders Yet</h3>
            <p>Create folders to organize your team tracks</p>
            {isContributor() && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className={sharedStyles.primaryButton}
              >
                <FaPlus />
                Create First Folder
              </button>
            )}
          </div>
        ) : (
          <div className={styles.foldersList}>
            {folders.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onClick={() => handleFolderClick(folder)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateFolderModal
          teamId={team.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </>
  );
}

export default TeamFoldersTab;

