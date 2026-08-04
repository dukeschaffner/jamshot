'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DAWConfig from '../../misc/DAWConfig';
import { snapToGrid } from '../../misc/DAWUtils';
import { normalizeLoopEnd } from '../../core/regionLoopUtils';

const LOOP_HANDLE_ZONE_PX = DAWConfig.ui.loopHandleZonePx ?? 15;

/**
 * Detect whether a pointer is in the top-right loop handle zone of a rect.
 * @param {DOMRect} rect
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} [zonePx]
 */
export function isInLoopHandleZone(rect, clientX, clientY, zonePx = LOOP_HANDLE_ZONE_PX) {
  if (!rect) return false;
  const inRight = clientX >= rect.right - zonePx && clientX <= rect.right;
  const inTop = clientY >= rect.top && clientY < rect.top + rect.height / 2;
  return inRight && inTop;
}

/**
 * Detect whether a pointer is in the bottom-right crop handle zone of a rect.
 */
export function isInCropEndHandleZone(rect, clientX, clientY, zonePx = LOOP_HANDLE_ZONE_PX) {
  if (!rect) return false;
  const inRight = clientX >= rect.right - zonePx && clientX <= rect.right;
  const inBottom = clientY >= rect.top + rect.height / 2 && clientY <= rect.bottom;
  return inRight && inBottom;
}

/**
 * Hook that owns Logic Pro-style region loop drag interactions.
 */
export default function useRegionLoopDrag({
  region,
  endTime,
  startTime,
  duration,
  tracksContainerWidth,
  regionContainerRef,
  originalEndEdgeRef,
  snapToGridEnabled,
  gridLinesRef,
  tracksContainerWidthRef,
  isReadOnly,
  isRecording,
  beginProjectTrackLock,
  trackId,
  onCommitLoop,
  onPreviewLoopEnd,
}) {
  const [isHoveringLoopHandle, setIsHoveringLoopHandle] = useState(false);
  const [isDraggingLoop, setIsDraggingLoop] = useState(false);
  const [previewLoopEnd, setPreviewLoopEnd] = useState(null);
  const originalLoopEndRef = useRef(null);
  const isDraggingLoopRef = useRef(false);
  const previewLoopEndRef = useRef(null);

  const clearHover = useCallback(() => {
    setIsHoveringLoopHandle(false);
  }, []);

  const updateHoverFromEvent = useCallback(
    (e) => {
      if (isReadOnly || isRecording || isDraggingLoopRef.current) return false;

      const containerRect = regionContainerRef.current?.getBoundingClientRect();
      const originalRect = originalEndEdgeRef?.current?.getBoundingClientRect?.()
        ?? containerRect;

      const hoveringContainer = isInLoopHandleZone(
        containerRect,
        e.clientX,
        e.clientY
      );
      const hoveringOriginal = originalEndEdgeRef?.current
        ? isInLoopHandleZone(originalRect, e.clientX, e.clientY)
        : false;

      const hovering = hoveringContainer || hoveringOriginal;
      setIsHoveringLoopHandle(hovering);
      return hovering;
    },
    [isReadOnly, isRecording, regionContainerRef, originalEndEdgeRef]
  );

  const beginLoopDrag = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (isReadOnly || isRecording) return;

      const startDrag = () => {
        originalLoopEndRef.current =
          region?.loopEnd != null && region.loopEnd > endTime
            ? region.loopEnd
            : endTime;
        isDraggingLoopRef.current = true;
        previewLoopEndRef.current = originalLoopEndRef.current;
        setIsDraggingLoop(true);
        setPreviewLoopEnd(originalLoopEndRef.current);
        onPreviewLoopEnd?.(originalLoopEndRef.current);
      };

      if (beginProjectTrackLock) {
        beginProjectTrackLock(trackId).then((ok) => {
          if (ok) startDrag();
        });
        return;
      }

      startDrag();
    },
    [
      isReadOnly,
      isRecording,
      region,
      endTime,
      beginProjectTrackLock,
      trackId,
      onPreviewLoopEnd,
    ]
  );

  useEffect(() => {
    if (!isDraggingLoop) return undefined;

    const handleMouseMove = (e) => {
      if (!duration || !tracksContainerWidth) return;

      const trackEl = regionContainerRef.current?.parentElement;
      const trackRect = trackEl?.getBoundingClientRect();
      if (!trackRect) return;

      let x = e.clientX;
      if (x < trackRect.left) x = trackRect.left;
      if (x > trackRect.right) x = trackRect.right;

      const percent = ((x - trackRect.left) / trackRect.width) * 100;
      const snappedPercent = snapToGrid(
        percent,
        snapToGridEnabled,
        duration,
        gridLinesRef.current,
        tracksContainerWidthRef.current,
        DAWConfig.ui.gridSnapThreshold
      );
      let nextLoopEnd = (snappedPercent / 100) * duration;

      // Loop end cannot go before the region start
      if (nextLoopEnd < startTime) {
        nextLoopEnd = startTime;
      }

      // Clamp to project duration
      if (nextLoopEnd > duration) {
        nextLoopEnd = duration;
      }

      previewLoopEndRef.current = nextLoopEnd;
      setPreviewLoopEnd(nextLoopEnd);
      onPreviewLoopEnd?.(nextLoopEnd);
    };

    const handleMouseUp = () => {
      isDraggingLoopRef.current = false;
      setIsDraggingLoop(false);

      const rawLoopEnd = previewLoopEndRef.current;
      const normalized = normalizeLoopEnd(endTime, rawLoopEnd);
      const previousLoopEnd =
        region?.loopEnd != null && region.loopEnd > endTime
          ? region.loopEnd
          : null;

      previewLoopEndRef.current = null;
      setPreviewLoopEnd(null);
      onPreviewLoopEnd?.(null);

      if (normalized !== previousLoopEnd) {
        onCommitLoop?.(normalized, previousLoopEnd);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        isDraggingLoopRef.current = false;
        setIsDraggingLoop(false);
        previewLoopEndRef.current = null;
        setPreviewLoopEnd(null);
        onPreviewLoopEnd?.(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isDraggingLoop,
    duration,
    tracksContainerWidth,
    regionContainerRef,
    snapToGridEnabled,
    gridLinesRef,
    tracksContainerWidthRef,
    startTime,
    endTime,
    region,
    onCommitLoop,
    onPreviewLoopEnd,
  ]);

  const displayLoopEnd =
    previewLoopEnd != null
      ? previewLoopEnd
      : region?.loopEnd != null && region.loopEnd > endTime
        ? region.loopEnd
        : null;

  return {
    isHoveringLoopHandle,
    isDraggingLoop,
    displayLoopEnd,
    updateHoverFromEvent,
    clearHover,
    beginLoopDrag,
    loopHandleZonePx: LOOP_HANDLE_ZONE_PX,
  };
}
