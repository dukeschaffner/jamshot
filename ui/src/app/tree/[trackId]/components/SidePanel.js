'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './SidePanel.module.css';

const SidePanel = ({ children, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [panelWidth, setPanelWidth] = useState(300); // Default width when expanded
  const [rememberedWidth, setRememberedWidth] = useState(300); // Width to restore when expanding
  const [isDragging, setIsDragging] = useState(false);
  
  const panelRef = useRef(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  // Constants for panel constraints
  const MIN_WIDTH = 200;
  const MAX_WIDTH = 600;
  const COLLAPSED_WIDTH = 32; /* Narrow strip so toggle stays visible without causing page overflow */

  const handleExpandCollapse = useCallback(() => {
    if (isExpanded) {
      // Collapsing: remember current width
      setRememberedWidth(panelWidth);
      setIsExpanded(false);
    } else {
      // Expanding: restore remembered width
      setPanelWidth(rememberedWidth);
      setIsExpanded(true);
    }
  }, [isExpanded, panelWidth, rememberedWidth]);

  const handleMouseDown = useCallback((e) => {
    if (!isExpanded) return;
    
    e.preventDefault();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = panelWidth;
    
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [isExpanded, panelWidth]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    const deltaX = dragStartXRef.current - e.clientX; // Reversed because we're dragging from right
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragStartWidthRef.current + deltaX));
    
    setPanelWidth(newWidth);
    setRememberedWidth(newWidth); // Update remembered width as user drags
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [isDragging]);

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const currentWidth = isExpanded ? panelWidth : COLLAPSED_WIDTH;
  const showContent = isExpanded;

  return (
    <div 
      ref={panelRef}
      className={`${styles.sidePanel} ${className} ${isExpanded ? '' : styles.collapsed} ${isDragging ? styles.dragging : ''}`}
      style={{ 
        width: `${currentWidth}px`,
        minWidth: isExpanded ? `${MIN_WIDTH}px` : `${COLLAPSED_WIDTH}px`
      }}
    >
      {/* Resize Handle - always visible for the button */}
      <div 
        className={`${styles.resizeHandle} ${isDragging ? styles.dragging : ''}`}
        onMouseDown={handleMouseDown}
        style={{ 
          cursor: isExpanded ? 'ew-resize' : 'default',
          pointerEvents: isExpanded ? 'auto' : 'none'
        }}
      >
        {/* Expand/Collapse Button - always visible */}
        <button 
          className={styles.expandButton}
          onClick={handleExpandCollapse}
          aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
          style={{ pointerEvents: 'auto' }}
        >
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 12 12" 
            fill="none"
            className={`${styles.arrow} ${isExpanded ? styles.expanded : styles.collapsed}`}
          >
            <path 
              d={isExpanded ? "M4 3L7 6L4 9" : "M8 3L5 6L8 9"} 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Panel Content */}
      <div 
        className={styles.panelContent}
        style={{ 
          opacity: showContent ? 1 : 0,
          visibility: showContent ? 'visible' : 'hidden'
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SidePanel;