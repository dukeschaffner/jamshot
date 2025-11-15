'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/Toast';

const ToastContext = createContext();

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((toastData) => {
    const id = toastIdCounter++;
    const toast = {
      id,
      ...toastData,
    };
    
    setToasts(prev => [...prev, toast]);
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showSuccess = useCallback((title, message, options = {}) => {
    return showToast({
      variant: 'success',
      title,
      message,
      duration: options.duration || 5000,
      ...options,
    });
  }, [showToast]);

  const showError = useCallback((title, message, options = {}) => {
    return showToast({
      variant: 'error',
      title,
      message,
      duration: options.duration || 7000,
      ...options,
    });
  }, [showToast]);

  const showInfo = useCallback((title, message, options = {}) => {
    return showToast({
      variant: 'info',
      title,
      message,
      duration: options.duration || 5000,
      ...options,
    });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo, dismissToast }}>
      {children}
      <div className="toast-wrapper" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 3000, display: 'flex', flexDirection: 'column', gap: '12px', pointerEvents: 'none' }}>
        {toasts.map((toast, index) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <Toast
              {...toast}
              onDismiss={dismissToast}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

