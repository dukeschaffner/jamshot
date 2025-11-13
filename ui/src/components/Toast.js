'use client';
import { useEffect } from 'react';
import { FaTimes, FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaRocket } from 'react-icons/fa';
import styles from './Toast.module.css';

const TOAST_VARIANTS = {
  success: {
    icon: FaCheckCircle,
    iconClass: styles.successIcon,
  },
  error: {
    icon: FaExclamationCircle,
    iconClass: styles.errorIcon,
  },
  info: {
    icon: FaInfoCircle,
    iconClass: styles.infoIcon,
  },
  release: {
    icon: FaRocket,
    iconClass: styles.releaseIcon,
  },
};

export default function Toast({ 
  id,
  title, 
  message, 
  variant = 'info',
  duration = 5000,
  onDismiss,
  action,
  actionLabel,
  onAction,
}) {
  const variantConfig = TOAST_VARIANTS[variant] || TOAST_VARIANTS.info;
  const Icon = variantConfig.icon;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        if (onDismiss) {
          onDismiss(id);
        }
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, id, onDismiss]);

  return (
    <div className={`${styles.toastContainer} ${styles[variant] || ''}`} style={{ position: 'relative' }}>
      <div className={styles.toast}>
        <div className={styles.toastContent}>
          <div className={`${styles.toastIcon} ${variantConfig.iconClass}`}>
            <Icon />
          </div>
          <div className={styles.toastText}>
            {title && <div className={styles.toastTitle}>{title}</div>}
            {message && <div className={styles.toastMessage}>{message}</div>}
          </div>
        </div>
        <div className={styles.toastActions}>
          {action && actionLabel && (
            <button 
              onClick={onAction}
              className={styles.actionButton}
            >
              {actionLabel}
            </button>
          )}
          {onDismiss && (
            <button 
              onClick={() => onDismiss(id)}
              className={styles.dismissButton}
              aria-label="Dismiss"
            >
              <FaTimes />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

