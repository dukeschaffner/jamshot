'use client';
import { useState, useEffect } from 'react';
import { teamApi } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import { FaTimes, FaFolder } from 'react-icons/fa';
import sharedStyles from '../../styles/Dashboard.module.css';
import styles from '../../app/teams/[id]/TeamDashboard.module.css';

function MoveTrackModal({ teamId, track, currentFolderId, onClose, onSuccess }) {
  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState('');
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        setIsLoading(true);
        const response = await teamApi.getFolders(teamId);
        setFolders(response.data.folders || []);
        // Initialize selected folder to current folder (so user can see current state)
        setSelectedFolderId(currentFolderId || null);
      } catch (err) {
        console.error('Error fetching folders:', err);
        setError('Failed to load folders');
      } finally {
        setIsLoading(false);
      }
    };

    if (teamId) {
      fetchFolders();
    }
  }, [teamId, currentFolderId]);

  const handleMove = async () => {
    try {
      setIsMoving(true);
      setError('');
      
      await teamApi.moveTrack(teamId, track.id, {
        folder_id: selectedFolderId || null
      });

      const destinationFolder = selectedFolderId 
        ? folders.find(f => f.id === selectedFolderId)?.name || 'folder'
        : 'Unorganized';
      
      showSuccess('Track Moved', `Track moved to ${destinationFolder} successfully`);
      
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Error moving track:', err);
      const errorMessage = err.response?.data?.error || 'Failed to move track';
      setError(errorMessage);
      showError('Move Failed', errorMessage);
    } finally {
      setIsMoving(false);
    }
  };

  const currentFolder = folders.find(f => f.id === currentFolderId);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.createModalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <FaFolder className={styles.modalFolderIcon} />
            <h2 className={styles.modalTitle}>Move Track</h2>
          </div>
          <button 
            className={styles.modalCloseButton}
            onClick={onClose}
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.moveTrackInfo}>
            <p><strong>{track?.title}</strong></p>
            {currentFolder && (
              <p className={styles.currentFolderInfo}>
                Currently in: <strong>{currentFolder.name}</strong>
              </p>
            )}
          </div>

          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p>Loading folders...</p>
            </div>
          ) : (
            <div className={styles.folderSelection}>
              <label className={styles.folderLabel}>Select destination folder:</label>
              
              <div className={styles.folderOptions}>
                <button
                  className={`${styles.folderOption} ${selectedFolderId === null ? styles.folderOptionSelected : ''}`}
                  onClick={() => setSelectedFolderId(null)}
                >
                  <FaFolder />
                  <span>Unorganized (No folder)</span>
                </button>

                {folders.map(folder => (
                  <button
                    key={folder.id}
                    className={`${styles.folderOption} ${selectedFolderId === folder.id ? styles.folderOptionSelected : ''}`}
                    onClick={() => setSelectedFolderId(folder.id)}
                    disabled={folder.id === currentFolderId}
                  >
                    <FaFolder />
                    <span>{folder.name}</span>
                    {folder.id === currentFolderId && (
                      <span className={styles.currentLabel}>(Current)</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            className={sharedStyles.secondaryButton}
            onClick={onClose}
            disabled={isMoving}
          >
            Cancel
          </button>
          <button
            className={sharedStyles.primaryButton}
            onClick={handleMove}
            disabled={isMoving || isLoading || selectedFolderId === currentFolderId}
          >
            {isMoving ? 'Moving...' : 'Move Track'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MoveTrackModal;

