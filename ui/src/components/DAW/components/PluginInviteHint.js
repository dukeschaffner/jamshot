'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FaPlug } from 'react-icons/fa';
import { usePluginWebSocket } from '../../../contexts/PluginWebSocketContext';
import styles from './PluginInviteHint.module.css';

const DISMISS_PERMANENT_KEY = 'sterio_plugin_hint_dismissed';
const REMIND_AFTER_KEY = 'sterio_plugin_hint_remind_after';
const REMIND_LATER_MS = 7 * 24 * 60 * 60 * 1000;

function readDismissedPermanently() {
  try {
    return localStorage.getItem(DISMISS_PERMANENT_KEY) === 'true';
  } catch {
    return false;
  }
}

function readRemindLaterActive() {
  try {
    const raw = localStorage.getItem(REMIND_AFTER_KEY);
    if (!raw) return false;
    const remindAfter = Number(raw);
    if (!Number.isFinite(remindAfter)) return false;
    return Date.now() < remindAfter;
  } catch {
    return false;
  }
}

export default function PluginInviteHint({ isVisible = true }) {
  const { status, userHasPlugin } = usePluginWebSocket();
  const [dismissedPermanently, setDismissedPermanently] = useState(false);
  const [remindLaterActive, setRemindLaterActive] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    setDismissedPermanently(readDismissedPermanently());
    setRemindLaterActive(readRemindLaterActive());
    setPrefsLoaded(true);
  }, []);

  const pluginAvailable = status === 'connected' || userHasPlugin;
  const statusSettled = status !== 'connecting';

  const shouldShow =
    isVisible &&
    prefsLoaded &&
    statusSettled &&
    !pluginAvailable &&
    !dismissedPermanently &&
    !remindLaterActive;

  const dismissPermanently = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_PERMANENT_KEY, 'true');
    } catch {
      /* ignore */
    }
    setDismissedPermanently(true);
  }, []);

  const remindLater = useCallback(() => {
    try {
      localStorage.setItem(REMIND_AFTER_KEY, String(Date.now() + REMIND_LATER_MS));
    } catch {
      /* ignore */
    }
    setRemindLaterActive(true);
  }, []);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className={styles.hint} role="status" aria-live="polite">
      <div className={styles.row}>
        <span className={styles.copy}>Want to record in your own DAW?</span>
        <Link href="/plugin" className={`link-underline text-seafoam`}>
          Get the Sterio plugin (free)
        </Link>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <button type="button" className={styles.dismissBtn} onClick={remindLater}>
          Not now
        </button>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <button type="button" className={styles.dismissBtn} onClick={dismissPermanently}>
          Don&apos;t show again
        </button>
      </div>
    </div>
  );
}
