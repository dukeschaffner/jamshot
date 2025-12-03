'use client';
import { useState, useEffect } from 'react';
import { teamApi, campApi } from '../../lib/api';
import { useToast } from '../../lib/ToastContext';
import { FaTimes, FaFolder, FaDoorOpen } from 'react-icons/fa';
import sharedStyles from '../../styles/Dashboard.module.css';
import styles from '../../app/team/[id]/TeamDashboard.module.css';

/**
 * Generic modal for moving tracks to folders (teams) or rooms (camps)
 * @param {string} type - 'folder' or 'room'
 * @param {number} teamId - Required if type is 'folder'
 * @param {number} campId - Required if type is 'room'
 * @param {Object} track - Track object to move
 * @param {number} currentId - Current folder_id or room_id
 * @param {Function} onClose - Callback when modal closes
 * @param {Function} onSuccess - Callback when move succeeds
 */
function MoveTrackModal({ type, teamId, campId, track, currentId, onClose, onSuccess }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState('');
  const { showSuccess, showError } = useToast();

  const isFolder = type === 'folder';
  const isRoom = type === 'room';

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setIsLoading(true);
        if (isFolder && teamId) {
          const response = await teamApi.getFolders(teamId);
          setItems(response.data.folders || []);
          setSelectedId(currentId || null);
        } else if (isRoom && campId) {
          // Fetch camp to get rooms
          const response = await campApi.getCamp(campId);
          setItems(response.data.rooms || []);
          setSelectedId(currentId || null);
        }
      } catch (err) {
        console.error(`Error fetching ${isFolder ? 'folders' : 'rooms'}:`, err);
        setError(`Failed to load ${isFolder ? 'folders' : 'rooms'}`);
      } finally {
        setIsLoading(false);
      }
    };

    if ((isFolder && teamId) || (isRoom && campId)) {
      fetchItems();
    }
  }, [type, teamId, campId, currentId, isFolder, isRoom]);

  const handleMove = async () => {
    try {
      setIsMoving(true);
      setError('');
      
      if (isFolder && teamId) {
        await teamApi.moveTrack(teamId, track.id, {
          folder_id: selectedId || null
        });
      } else if (isRoom && campId) {
        await campApi.moveTrackToRoom(campId, track.id, {
          room_id: selectedId || null
        });
      }

      const destinationName = selectedId 
        ? items.find(item => item.id === selectedId)?.name || (isFolder ? 'folder' : 'room')
        : (isFolder ? 'Unorganized' : 'No Room');
      
      showSuccess('Track Moved', `Track moved to ${destinationName} successfully`);
      
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

  const currentItem = items.find(item => item.id === currentId);

  const Icon = isFolder ? FaFolder : FaDoorOpen;
  const emptyLabel = isFolder ? 'Unorganized (No folder)' : 'No Room';
  const loadingText = isFolder ? 'Loading folders...' : 'Loading rooms...';
  const selectLabel = isFolder ? 'Select destination folder:' : 'Select destination room:';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.createModalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <Icon className={styles.modalFolderIcon} />
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
            {currentItem && (
              <p className={styles.currentFolderInfo}>
                Currently in: <strong>{currentItem.name}</strong>
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
              <p>{loadingText}</p>
            </div>
          ) : (
            <div className={styles.folderSelection}>
              <label className={styles.folderLabel}>{selectLabel}</label>
              
              <div className={styles.folderOptions}>
                <button
                  className={`${styles.folderOption} ${selectedId === null ? styles.folderOptionSelected : ''}`}
                  onClick={() => setSelectedId(null)}
                >
                  <Icon />
                  <span>{emptyLabel}</span>
                </button>

                {items.map(item => (
                  <button
                    key={item.id}
                    className={`${styles.folderOption} ${selectedId === item.id ? styles.folderOptionSelected : ''}`}
                    onClick={() => setSelectedId(item.id)}
                    disabled={item.id === currentId}
                  >
                    <Icon />
                    <span>{item.name}</span>
                    {item.id === currentId && (
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
            disabled={isMoving || isLoading || selectedId === currentId}
          >
            {isMoving ? 'Moving...' : 'Move Track'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MoveTrackModal;

