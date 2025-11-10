import { useState } from 'react';
import { campApi } from '../../../../lib/api';
import { FaTimes } from 'react-icons/fa';
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
    } catch (err) {
      console.error('Error creating room:', err);
      setError(err.response?.data?.error || 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={(e) => {
      if (e.target.className === 'modal-overlay active') {
        onClose();
      }
    }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">Create Room</h2>
          <button onClick={onClose} className="modal-close">
            <FaTimes />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className={styles.errorMessage}>{error}</div>
            )}
            <div className={styles.formGroup}>
              <label htmlFor="roomName">Room Name</label>
              <input
                id="roomName"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g., Vocals, Beats, Production"
                className={styles.settingsInput}
                disabled={isCreating}
                autoFocus
              />
              <p className={styles.helpText}>
                Create focused spaces for different aspects of your project
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className={styles.secondaryButton}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
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
