'use client';
import { FaExclamationTriangle } from 'react-icons/fa';
import styles from './ConfirmationDialog.module.css';

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default', // 'default' or 'danger'
  confirmDisabled = false,
  children
}) {
  if (!isOpen) return null;

  return (
    <div 
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <FaExclamationTriangle className={styles.icon} />
          <h2 className={styles.title}>{title}</h2>
        </div>
        <p className={styles.message}>{message}</p>
        {children}
        <div className={styles.actions}>
          <button
            onClick={onClose}
            className={`${styles.button} ${styles.cancelButton}`}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`${styles.button} ${styles[variant === 'danger' ? 'dangerButton' : 'confirmButton']}`}
            disabled={confirmDisabled}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

