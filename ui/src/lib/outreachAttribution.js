const OUTREACH_CODE_QUERY_PARAM = 'oc';
const OUTREACH_CODE_STORAGE_KEY = 'sterio_outreach_code';

/**
 * Persist outreach short code from the current URL query into localStorage.
 * Safe to call on every page load.
 */
export function captureOutreachCodeFromUrl() {
  if (typeof window === 'undefined') return;

  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get(OUTREACH_CODE_QUERY_PARAM);
    if (code && typeof code === 'string' && code.trim()) {
      localStorage.setItem(OUTREACH_CODE_STORAGE_KEY, code.trim());
    }
  } catch (error) {
    console.error('Failed to capture outreach code from URL:', error);
  }
}

/**
 * @returns {string|null}
 */
export function getStoredOutreachCode() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(OUTREACH_CODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear stored outreach code after successful attribution.
 */
export function clearStoredOutreachCode() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(OUTREACH_CODE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Send stored outreach code to the API for first-touch attribution.
 * No-ops if no code is stored. Clears storage on success or permanent failure.
 * @returns {Promise<boolean>} true if attribution request completed without network error
 */
export async function flushOutreachAttribution() {
  const outreachCode = getStoredOutreachCode();
  if (!outreachCode) {
    return false;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

  try {
    const response = await fetch(`${apiUrl}/outreach/attribution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ outreachCode }),
    });

    if (response.ok || response.status === 404) {
      // 404 = invalid code; clear so we don't retry forever
      clearStoredOutreachCode();
      return response.ok;
    }

    // Auth failures: keep code for a later retry
    if (response.status === 401 || response.status === 403) {
      return false;
    }

    clearStoredOutreachCode();
    return false;
  } catch (error) {
    console.error('Failed to flush outreach attribution:', error);
    return false;
  }
}
