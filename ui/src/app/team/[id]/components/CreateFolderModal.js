'use client';
import { useState } from 'react';
import { teamApi } from '../../../../lib/api';
import { FaTimes, FaFolder } from 'react-icons/fa';
import sharedStyles from '../../../../styles/Dashboard.module.css';
import styles from '../TeamDashboard.module.css';

function CreateFolderModal({ teamId, onClose, onSuccess }) {
  const [folderName, setFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!folderName.trim()) {
      setError('Folder name is required');
      return;
    }

    try {
      setIsCreating(true);
      setError('');
      const response = await teamApi.createFolder(teamId, { name: folderName.trim() });
      onSuccess(response.data);
      onClose();
    } catch (err) {
      console.error('Error creating folder:', err);
      setError(err.response?.data?.error || 'Failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.createModalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <FaFolder className={styles.modalFolderIcon} />
            <h2 className={styles.modalTitle}>Create Folder</h2>
          </div>
          <button onClick={onClose} className={styles.modalCloseButton}>
            <FaTimes />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && (
              <div className={styles.errorMessage}>{error}</div>
            )}
            <div className={styles.formGroup}>
              <label htmlFor="folderName">Folder Name</label>
              <input
                id="folderName"
                type="text"
                value={folderName}
                onChange={(e) => {
                  setFolderName(e.target.value);
                  setError('');
                }}
                placeholder="e.g., Project A, Vocals, Beats"
                className={styles.settingsInput}
                disabled={isCreating}
                autoFocus
                maxLength={100}
              />
              <p className={styles.helpText}>
                Organize your team tracks into folders for better management
              </p>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={onClose}
              className={sharedStyles.secondaryButton}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={sharedStyles.primaryButton}
              disabled={isCreating || !folderName.trim()}
            >
              {isCreating ? 'Creating...' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateFolderModal;

