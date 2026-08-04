/**
 * Track whether the primary pointer is released after arming.
 * Used to close races between async lock acquire and React listener attach.
 *
 * @returns {{ wasReleased: () => boolean, dispose: () => void }}
 */
export function createPointerUpGuard() {
  let released = false;

  const onUp = () => {
    released = true;
  };

  document.addEventListener('mouseup', onUp, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', onUp, true);

  return {
    wasReleased: () => released,
    dispose: () => {
      document.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    },
  };
}

/**
 * Acquire a track lock only if the primary pointer stays held through acquire.
 * If the pointer is released first, any acquired lock is released and the
 * result is marked cancelled — prevents stuck locks from click/drag races.
 *
 * @param {(trackId: number) => Promise<boolean>} acquireTrackLock
 * @param {(trackId: number) => void} releaseTrackLock
 * @param {number} trackId
 * @returns {Promise<{ ok: boolean, cancelled: boolean }>}
 */
export function acquireTrackLockWhilePointerHeld(
  acquireTrackLock,
  releaseTrackLock,
  trackId
) {
  return new Promise((resolve) => {
    let settled = false;
    const guard = createPointerUpGuard();

    const finish = (result) => {
      if (settled) return;
      settled = true;
      guard.dispose();
      resolve(result);
    };

    Promise.resolve(acquireTrackLock(trackId))
      .then((ok) => {
        if (!ok) {
          finish({ ok: false, cancelled: false });
          return;
        }
        if (guard.wasReleased()) {
          releaseTrackLock(trackId);
          finish({ ok: false, cancelled: true });
          return;
        }
        finish({ ok: true, cancelled: false });
      })
      .catch(() => {
        finish({ ok: false, cancelled: false });
      });
  });
}
