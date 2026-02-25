'use client';

import { useState, useEffect, useRef } from 'react';
import styles from '../TreeView.module.css';

export default function DebugOverlay({ reactFlowInstance, containerRef }) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [flowPosition, setFlowPosition] = useState({ x: 0, y: 0 });
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!containerRef?.current) return;

    const handleMouseMove = (event) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const viewportX = event.clientX - rect.left;
      const viewportY = event.clientY - rect.top;

      setMousePosition({ x: viewportX, y: viewportY });

      // Convert to flow coordinates if ReactFlow instance is available
      if (reactFlowInstance) {
        const flowCoords = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        setFlowPosition({ x: flowCoords.x, y: flowCoords.y });
      }
    };

    const container = containerRef.current;
    container.addEventListener('mousemove', handleMouseMove);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
    };
  }, [reactFlowInstance, containerRef]);

  return (
    <div ref={overlayRef} className={styles['debug-overlay']}>
      <div className={styles['debug-content']}>
        <div className={styles['debug-row']}>
          <span className={styles['debug-label']}>Viewport:</span>
          <span className={styles['debug-value']}>
            {Math.round(mousePosition.x)}, {Math.round(mousePosition.y)}
          </span>
        </div>
        <div className={styles['debug-row']}>
          <span className={styles['debug-label']}>Flow:</span>
          <span className={styles['debug-value']}>
            {Math.round(flowPosition.x)}, {Math.round(flowPosition.y)}
          </span>
        </div>
      </div>
    </div>
  );
}

