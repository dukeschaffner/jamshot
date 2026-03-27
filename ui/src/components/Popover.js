'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './TagsPopover.module.css';

export default function Popover({
  isVisible,
  anchorElement,
  children,
  className = '',
  style,
  zIndex = 10000,
  offset = 8,
  onMouseEnter,
  onMouseLeave,
}) {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isVisible || !anchorElement) return;

    const updatePosition = () => {
      if (!popoverRef.current) {
        requestAnimationFrame(updatePosition);
        return;
      }

      const rect = anchorElement.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect();

      if (!popoverRect) return;

      const top = rect.top - popoverRect.height - offset;
      const left = rect.left + rect.width / 2 - popoverRect.width / 2;

      const viewportWidth = window.innerWidth;

      let finalLeft = left;
      let finalTop = top;

      if (finalLeft < offset) {
        finalLeft = offset;
      } else if (finalLeft + popoverRect.width > viewportWidth - offset) {
        finalLeft = viewportWidth - popoverRect.width - offset;
      }

      if (finalTop < offset) {
        finalTop = rect.bottom + offset;
      }

      setPosition({ top: finalTop, left: finalLeft });
    };

    const timeoutId = setTimeout(updatePosition, 0);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, anchorElement, offset]);

  if (!isVisible) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popoverContent + ' ' + className}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex,
        ...style,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  );
}

