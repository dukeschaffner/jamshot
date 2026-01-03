'use client';
import { FaTimes } from 'react-icons/fa';
import LoginForm from './LoginForm';
import styles from './LoginModal.module.css';

export default function LoginModal({ isOpen, onClose, onSuccess }) {
  if (!isOpen) return null;

  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div 
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Sign In</h2>
          <button 
            className={styles.closeBtn} 
            onClick={onClose}
            aria-label="Close login modal"
          >
            <FaTimes />
          </button>
        </div>
        <div className={styles.body}>
          <LoginForm 
            onSuccess={handleSuccess}
            showLinks={false}
            noRedirect={true}
          />
        </div>
      </div>
    </div>
  );
}

