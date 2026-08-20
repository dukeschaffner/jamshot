'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { RequireAdmin } from '@/components/RequireAdmin';
import {
  outreachApi,
  type OutreachMessageVariant,
} from '@/lib/outreachApi';

export default function MessageVariantsPage() {
  const [variants, setVariants] = useState<OutreachMessageVariant[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await outreachApi.listMessageVariants();
      setVariants(data.messageVariants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variants');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await outreachApi.createMessageVariant({
        name,
        body: body || undefined,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      });
      setName('');
      setSlug('');
      setBody('');
      setSuccess('Message variant created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create variant');
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireAdmin>
      <AdminShell>
        <div className="panel">
          <h1>Message variants</h1>
          <p className="muted">
            Reusable message copy. The same variant can be used across campaigns.
          </p>
        </div>

        <div className="panel">
          <h2>Create variant</h2>
          <form className="stack" onSubmit={onCreate}>
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
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hey — check out Sterio…"
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            {success ? <p className="success">{success}</p> : null}
            <button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create variant'}
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Variants</h2>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : variants.length === 0 ? (
            <p className="muted">No variants yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Body</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td className="code">{v.slug}</td>
                    <td className="muted">{v.body || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </AdminShell>
    </RequireAdmin>
  );
}
