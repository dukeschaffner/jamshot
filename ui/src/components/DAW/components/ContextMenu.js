'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import contextMenuStyles from './ContextMenu.module.css';

export default function ContextMenu({ x, y, show, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return () => {
      window.removeEventListener("click", close); 
      window.removeEventListener("keydown", (e) => e.key === "Escape" && close());
    };
  }, []);

    // Handle click outside context menu to close it
    useEffect(() => {
      const handleClickOutside = () => {
        onClose();
      };
      
      if (show) {
        document.addEventListener('click', handleClickOutside);
      }
      
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }, [show]);

  return show && x > 0 && y > 0 ? createPortal(
    <div
      className={contextMenuStyles.contextMenu} 
      style={{
        top: y,
        left: x,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.action();
            onClose();
          }}
          disabled={item.disabled}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
  : null;
};