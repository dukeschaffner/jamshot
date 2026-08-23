'use client';

import { useState } from 'react';
import { formatOutreachMessage } from '@/lib/formatOutreachMessage';

export async function copyOutreachMessage(
  body: string | null | undefined,
  shortUrl: string
): Promise<boolean> {
  const text = formatOutreachMessage(body, shortUrl);
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Props = {
  body?: string | null;
  shortUrl: string;
  variantLabel?: string | null;
  showResolved?: boolean;
};

export function CopyOutreachMessage({
  body,
  shortUrl,
  variantLabel,
  showResolved = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const resolved = formatOutreachMessage(body, shortUrl);
  const preview = showResolved ? resolved : body?.trim() || '';

  async function onCopy() {
    const ok = await copyOutreachMessage(body, shortUrl);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!resolved && !preview) {
    return (
      <div className="copy-message">
        {variantLabel ? <div className="code">{variantLabel}</div> : null}
        <span className="muted">—</span>
      </div>
    );
  }

  return (
    <div className="copy-message">
      <div className="copy-message-header">
        {variantLabel ? <div className="code">{variantLabel}</div> : null}
        <button
          type="button"
          className="copy-message-icon-btn"
          onClick={onCopy}
          title={copied ? 'Copied' : 'Copy message'}
          aria-label={copied ? 'Copied' : 'Copy message'}
        >
          {copied ? (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M6.2 11.4 2.8 8l1.1-1.1 2.3 2.3 5.9-5.9L13.2 4z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path
                fill="currentColor"
                d="M5 2h8a1 1 0 0 1 1 1v8h-1.5V3.5H5V2zm-2 3h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm.5 1.5v7h7v-7h-7z"
              />
            </svg>
          )}
        </button>
      </div>
      {preview ? (
        <button
          type="button"
          className="copy-message-body"
          onClick={onCopy}
          title={copied ? 'Copied' : 'Copy message'}
        >
          {preview}
        </button>
      ) : null}
    </div>
  );
}
