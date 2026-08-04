'use client';

import { useEffect, useState } from 'react';

const peaksCache = new Map();

async function fetchPeaksFromUrl(waveformUrl) {
  if (peaksCache.has(waveformUrl)) {
    return peaksCache.get(waveformUrl);
  }

  const response = await fetch(waveformUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch waveform: ${response.status}`);
  }

  const data = await response.json();
  if (!data.peaks?.['256']) {
    throw new Error('Invalid waveform data format');
  }

  const peaks = data.peaks['256'];
  peaksCache.set(waveformUrl, peaks);
  return peaks;
}

/**
 * Lazy-load waveform peaks JSON from a URL.
 *
 * @param {string|null|undefined} waveformUrl
 * @param {boolean} [enabled=true] - When false, skips fetching (e.g. off-screen rows)
 */
export function useWaveformPeaks(waveformUrl, enabled = true) {
  const [peaks, setPeaks] = useState(null);
  const [loading, setLoading] = useState(Boolean(waveformUrl && enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!waveformUrl || !enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const nextPeaks = await fetchPeaksFromUrl(waveformUrl);
        if (!cancelled) {
          setPeaks(nextPeaks);
        }
      } catch (err) {
        if (!cancelled) {
          setPeaks(null);
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [waveformUrl, enabled]);

  return { peaks, loading, error };
}
