'use client';
import { useState } from 'react';
import { campApi } from '@/lib/api';
import { FaTimes, FaDoorOpen } from 'react-icons/fa';
import sharedStyles from '@/styles/Dashboard.module.css';
import styles from '../CampDashboard.module.css';

function CreateRoomModal({ campId, onClose, onSuccess }) {
  const [roomName, setRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }

    try {
      setIsCreating(true);
      setError('');
      const response = await campApi.createRoom(campId, { name: roomName.trim() });
      onSuccess(response.data);
      onClose();
    } catch (err) {
      console.error('Error creating room:', err);
      setError(err.response?.data?.error || 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.createModalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <FaDoorOpen className={styles.modalRoomIcon} />
            <h2 className={styles.modalTitle}>Create Room</h2>
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
              <label htmlFor="roomName">Room Name</label>
              <input
                id="roomName"
                type="text"
                value={roomName}
                onChange={(e) => {
                  setRoomName(e.target.value);
                  setError('');
                }}
                placeholder="e.g., Vocals, Beats, Production"
                className={styles.settingsInput}
                disabled={isCreating}
                autoFocus
                maxLength={100}
              />
              <p className={styles.helpText}>
                Create focused spaces for different aspects of your project
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
              disabled={isCreating || !roomName.trim()}
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateRoomModal;
