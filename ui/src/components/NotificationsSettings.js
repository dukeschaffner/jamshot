'use client';
import { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import api from '../lib/api';
import styles from './NotificationsSettings.module.css';

export default function NotificationsSettings() {
  const { user } = useUser();
  const [preferences, setPreferences] = useState({
    activity_summary_frequency: 'weekly',
    collab_email_enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setLoading(true);
        const response = await api.get('/notifications/preferences');
        setPreferences(response.data);
      } catch (err) {
        console.error('Error loading notification preferences:', err);
        setError('Failed to load notification preferences');
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      setSaving(true);
      await api.put('/notifications/preferences', preferences);
      setSuccess('Notification preferences saved successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error saving notification preferences:', err);
      setError(err.response?.data?.error || 'Failed to save notification preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleFrequencyChange = (frequency) => {
    setPreferences(prev => ({
      ...prev,
      activity_summary_frequency: frequency
    }));
  };

  const handleCollabToggle = () => {
    setPreferences(prev => ({
      ...prev,
      collab_email_enabled: !prev.collab_email_enabled
    }));
  };

  if (loading) {
    return (
      <div className={styles.notificationsSettings}>
        <h1 className={styles.title}>Notifications</h1>
        <p>Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className={styles.notificationsSettings}>
      <h1 className={styles.title}>Email Notifications</h1>
      
      {!user?.email_verified && (
        <div className={styles.warning}>
          <p>⚠️ Your email address is not verified. Please verify your email to receive notifications.</p>
        </div>
      )}
      
      <form onSubmit={handleSave} className={styles.form}>
        {/* Activity Summary Frequency */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Activity Summary Emails</h3>
          <p className={styles.sectionDescription}>
            Get periodic summaries of your track performance, including plays, likes, comments, and new followers.
          </p>
          
          <div className={styles.radioGroup}>
            {[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'none', label: 'Never' }
            ].map(option => (
              <label key={option.value} className={styles.radioOption}>
                <input
                  type="radio"
                  name="activity_summary_frequency"
                  value={option.value}
                  checked={preferences.activity_summary_frequency === option.value}
                  onChange={() => handleFrequencyChange(option.value)}
                  className={styles.radioInput}
                />
                <span className={styles.radioLabel}>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Collaboration Emails */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Collaboration Notifications</h3>
          <p className={styles.sectionDescription}>
            Get notified immediately when someone adds a collaboration to your tracks.
          </p>
          
          <label className={styles.toggleOption}>
            <input
              type="checkbox"
              checked={preferences.collab_email_enabled}
              onChange={handleCollabToggle}
              className={styles.toggleInput}
            />
            <span className={styles.toggleSlider}></span>
            <span className={styles.toggleLabel}>
              Email me when someone collaborates on my tracks
            </span>
          </label>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}
        
        {success && (
          <div className={styles.success}>
            {success}
          </div>
        )}

        {/* Save Button */}
        <div className={styles.actions}>
          <button 
            type="submit" 
            className={styles.saveButton}
            disabled={saving || !user?.email_verified}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>
      
      <div className={styles.footer}>
        <p className={styles.footerText}>
          All notification emails include an unsubscribe link. You can change these preferences at any time.
        </p>
      </div>
    </div>
  );
}

