import { useState } from 'react';
import { campApi } from '../../../../lib/api';
import { FaTimes } from 'react-icons/fa';
import styles from '../CampDashboard.module.css';

function SettingsModal({ camp, onClose, onUpdate }) {
  const [campName, setCampName] = useState(camp.name);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!campName.trim()) {
      alert('Camp name cannot be empty');
      return;
    }

    try {
      setIsSaving(true);
      const response = await campApi.updateCamp(camp.id, { name: campName });
      onUpdate(response.data);
    } catch (err) {
      console.error('Error updating camp:', err);
      alert('Failed to update camp settings');
    } finally {
      setIsSaving(false);
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
          <h2 className="modal-title">Camp Settings</h2>
          <button onClick={onClose} className="modal-close">
            <FaTimes />
          </button>
        </div>
        <div className="modal-body">
          <div className={styles.settingsSection}>
            <label>Camp Name</label>
            <input
              type="text"
              value={campName}
              onChange={(e) => setCampName(e.target.value)}
              className={styles.settingsInput}
            />
          </div>

          {/* TODO: Add more settings like room management, user management */}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className={styles.secondaryButton}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={styles.primaryButton}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
