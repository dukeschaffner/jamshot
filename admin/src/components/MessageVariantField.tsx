'use client';

import { useImperativeHandle, useState, forwardRef } from 'react';
import {
  outreachApi,
  type OutreachMessageVariant,
} from '@/lib/outreachApi';

export type MessageVariantFieldHandle = {
  resolveVariantId: () => Promise<number>;
};

type Props = {
  variants: OutreachMessageVariant[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (variant: OutreachMessageVariant) => void;
};

export const MessageVariantField = forwardRef<MessageVariantFieldHandle, Props>(
  function MessageVariantField({ variants, value, onChange, onCreated }, ref) {
    const [mode, setMode] = useState<'existing' | 'new'>(
      variants.length > 0 ? 'existing' : 'new'
    );
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [body, setBody] = useState('');

    useImperativeHandle(ref, () => ({
      async resolveVariantId() {
        if (mode === 'existing') {
          const id = Number(value);
          if (!Number.isFinite(id) || id <= 0) {
            throw new Error('Select a message variant');
          }
          return id;
        }

        if (!name.trim()) {
          throw new Error('Message variant name is required');
        }

        const { messageVariant } = await outreachApi.createMessageVariant({
          name: name.trim(),
          body: body.trim() || undefined,
          ...(slug.trim() ? { slug: slug.trim() } : {}),
        });

        onCreated(messageVariant);
        onChange(String(messageVariant.id));
        setName('');
        setSlug('');
        setBody('');
        setMode('existing');
        return messageVariant.id;
      },
    }));

    return (
      <div className="stack" style={{ minWidth: 220, flex: 1 }}>
        <span className="field-label">Message variant</span>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'existing' ? 'active' : ''}
            disabled={variants.length === 0}
            onClick={() => {
              setMode('existing');
            }}
          >
            Select existing
          </button>
          <button
            type="button"
            className={mode === 'new' ? 'active' : ''}
            onClick={() => {
              setMode('new');
            }}
          >
            Create new
          </button>
        </div>

        {mode === 'existing' ? (
          <label>
            Variant
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              required
            >
              {variants.length === 0 ? (
                <option value="">No variants yet</option>
              ) : (
                variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.slug})
                  </option>
                ))
              )}
            </select>
          </label>
        ) : (
          <>
            <div className="row">
              <label>
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="V1"
                />
              </label>
              <label>
                Slug (optional)
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="v1"
                />
              </label>
            </div>
            <label>
              Body (optional)
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hey — check out Sterio…"
              />
            </label>
          </>
        )}
      </div>
    );
  }
);
