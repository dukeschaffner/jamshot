import { useEffect, useLayoutEffect, useRef } from 'react';
import DAWConfig from '../misc/DAWConfig';

/**
 * Timeline viewport wheel controls:
 * - Ctrl + wheel (and macOS pinch, which browsers emit as ctrlKey wheel) → horizontal zoom
 * - Shift + wheel → horizontal scroll
 * Unmodified vertical/horizontal wheel events are left to native scrollers.
 *
 * Zoom is applied to the DOM synchronously (width + scrollLeft) so rapid trackpad
 * pinch events accumulate smoothly; React zoom state is coalesced via rAF.
 */
export function useTimelineWheelControls({
  scrollContainerRef,
  contentRef,
  zoom,
  setZoomLevel,
  enabled = true,
}) {
  const zoomRef = useRef(zoom);
  const setZoomLevelRef = useRef(setZoomLevel);
  const zoomRafRef = useRef(null);
  const transitionResetTimerRef = useRef(null);
  const gestureActiveRef = useRef(false);
  const anchorRef = useRef(null);

  useEffect(() => {
    setZoomLevelRef.current = setZoomLevel;
  }, [setZoomLevel]);

  // Keep zoomRef in sync with external updates (slider), but not mid-gesture.
  useEffect(() => {
    if (!gestureActiveRef.current) {
      zoomRef.current = zoom;
    }
  }, [zoom]);

  // After React applies a zoom style, restore live gesture zoom/scroll if a
  // stale paint landed between wheel events.
  useLayoutEffect(() => {
    if (!gestureActiveRef.current) return;

    const container = scrollContainerRef.current;
    const content = contentRef?.current;
    const liveZoom = zoomRef.current;
    if (!container || !content) return;

    const widthPercent = `${Math.max(100, liveZoom * 100)}%`;
    content.style.transition = 'none';
    content.style.width = widthPercent;
    content.style.minWidth = widthPercent;

    const anchor = anchorRef.current;
    if (!anchor) return;

    void content.offsetWidth; // ensure scrollWidth matches the live width
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    container.scrollLeft = Math.min(
      maxScroll,
      Math.max(0, anchor.contentX * (Math.max(1, liveZoom) / Math.max(1, anchor.baseZoom)) - anchor.pointerX)
    );
  }, [zoom, scrollContainerRef, contentRef]);

  useEffect(() => {
    if (!enabled) return undefined;

    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const { min, max } = DAWConfig.ui.zoomLevels;
    const sensitivity = DAWConfig.ui.wheelZoomSensitivity;
    const maxDelta = DAWConfig.ui.wheelZoomMaxDelta;

    const commitZoomToReact = () => {
      if (zoomRafRef.current != null) {
        cancelAnimationFrame(zoomRafRef.current);
      }
      zoomRafRef.current = requestAnimationFrame(() => {
        zoomRafRef.current = null;
        setZoomLevelRef.current(zoomRef.current);
      });
    };

    const markGestureActive = (content) => {
      gestureActiveRef.current = true;
      if (content) {
        content.style.transition = 'none';
      }
      if (transitionResetTimerRef.current != null) {
        clearTimeout(transitionResetTimerRef.current);
      }
      transitionResetTimerRef.current = setTimeout(() => {
        transitionResetTimerRef.current = null;
        gestureActiveRef.current = false;
        anchorRef.current = null;
        if (content) {
          content.style.transition = '';
        }
        // Final sync so slider/state match the live zoom.
        setZoomLevelRef.current(zoomRef.current);
      }, 150);
    };

    const applyZoomAroundPointer = (event, oldZoom, newZoom) => {
      const content = contentRef?.current ?? null;
      const rect = container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const contentX = container.scrollLeft + pointerX;

      // Anchor stays in the coordinate space of the zoom we started this
      // event from, so scale = newZoom / oldZoom remains correct.
      anchorRef.current = { contentX, pointerX, baseZoom: oldZoom };
      markGestureActive(content);

      if (content) {
        const widthPercent = `${Math.max(100, newZoom * 100)}%`;
        content.style.width = widthPercent;
        content.style.minWidth = widthPercent;
        void content.offsetWidth;
      }

      const scale = Math.max(1, newZoom) / Math.max(1, oldZoom);
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      container.scrollLeft = Math.min(
        maxScroll,
        Math.max(0, contentX * scale - pointerX)
      );

      zoomRef.current = newZoom;
      commitZoomToReact();
    };

    const onWheel = (event) => {
      // Ctrl+wheel / macOS pinch → pointer-anchored horizontal zoom
      if (event.ctrlKey) {
        event.preventDefault();

        const oldZoom = zoomRef.current;
        let delta = event.deltaY;
        if (event.deltaMode === 1) {
          delta *= 16; // line → approximate pixels
        } else if (event.deltaMode === 2) {
          delta *= container.clientHeight; // page → pixels
        }
        delta = Math.max(-maxDelta, Math.min(maxDelta, delta));

        const zoomFactor = Math.exp(-delta * sensitivity);
        const newZoom = Math.min(max, Math.max(min, oldZoom * zoomFactor));
        if (Math.abs(newZoom - oldZoom) < 0.001) {
          return;
        }

        applyZoomAroundPointer(event, oldZoom, newZoom);
        return;
      }

      // Shift+wheel → horizontal scroll
      if (event.shiftKey) {
        const delta =
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
        if (delta === 0) {
          return;
        }
        event.preventDefault();
        container.scrollLeft += delta;
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
      if (zoomRafRef.current != null) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = null;
      }
      if (transitionResetTimerRef.current != null) {
        clearTimeout(transitionResetTimerRef.current);
        transitionResetTimerRef.current = null;
      }
      gestureActiveRef.current = false;
      anchorRef.current = null;
    };
  }, [scrollContainerRef, contentRef, enabled]);
}
