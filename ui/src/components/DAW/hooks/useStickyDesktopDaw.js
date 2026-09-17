import { useEffect, useState } from 'react';
import { useMobile } from '@/contexts/MobileContext';

/**
 * Decides whether a page should mount the desktop DAW.
 *
 * `isMobile` from MobileContext is recomputed on every window resize (innerWidth <= 768),
 * so a desktop window being resized, browser zoom, or a tablet rotating can flip it to
 * `true` mid-session. Swapping the DAW for the "Desktop Required" message at that point
 * unmounts DAWProvider, which destroys the TrackManager: unsaved recordings are lost and
 * any in-flight upload ends up sending an empty stems array.
 *
 * Once the DAW has been mounted for a desktop viewport, keep it mounted for the life of
 * the page. Callers should hide it (display: none) and show the mobile message instead
 * while `isMobile` is true.
 *
 * @returns {{ shouldMountDaw: boolean, isMobile: boolean }}
 */
export function useStickyDesktopDaw() {
  const { isMobile, isLoading } = useMobile();
  const isDesktopReady = !isLoading && !isMobile;
  const [shouldMountDaw, setShouldMountDaw] = useState(isDesktopReady);

  useEffect(() => {
    if (isDesktopReady) {
      setShouldMountDaw(true);
    }
  }, [isDesktopReady]);

  return { shouldMountDaw, isMobile };
}

export default useStickyDesktopDaw;
