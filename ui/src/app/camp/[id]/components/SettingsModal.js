'use client';
import { useState } from 'react';
import { campApi } from '../../../../lib/api';
import { FaTimes } from 'react-icons/fa';
import sharedStyles from '../../../../styles/Dashboard.module.css';
import styles from '../CampDashboard.module.css';

function SettingsModal({ camp, onClose, onUpdate }) {
  const [campName, setCampName] = useState(camp.name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!campName.trim()) {
      setError('Camp name cannot be empty');
      return;
    }

    if (campName === camp.name) {
      onClose();
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      const response = await campApi.updateCamp(camp.id, { name: campName.trim() });
      onUpdate(response.data);
      onClose();
    } catch (err) {
      console.error('Error updating camp:', err);
      setError(err.response?.data?.error || 'Failed to update camp settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={sharedStyles.modalOverlay} onClick={onClose}>
      <div className={`${sharedStyles.modal} ${styles.settingsModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.settingsModalHeader}>
          <h2>Camp Settings</h2>
          <button onClick={onClose} className={styles.settingsCloseButton}>
            <FaTimes />
          </button>
        </div>
        <div className={styles.settingsModalBody}>
          {error && (
            <div className={styles.errorMessage}>{error}</div>
          )}
          <div className={styles.settingsSection}>
            <label htmlFor="campName">Camp Name</label>
            <input
              id="campName"
              type="text"
              value={campName}
              onChange={(e) => {
                setCampName(e.target.value);
                setError('');
              }}
              className={styles.settingsInput}
              placeholder="Enter camp name"
              maxLength={100}
            />
          </div>

          {/* TODO: Add more settings like room management, user management */}
        </div>
        <div className={styles.modalFooter}>
          <button onClick={onClose} className={sharedStyles.secondaryButton}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={sharedStyles.primaryButton}
            disabled={isSaving || !campName.trim() || campName === camp.name}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
