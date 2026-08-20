'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { RequireAdmin } from '@/components/RequireAdmin';
import {
  outreachApi,
  type OutreachCampaign,
} from '@/lib/outreachApi';

export default function OutreachCampaignsPage() {
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await outreachApi.listCampaigns();
      setCampaigns(data.campaigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
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
      await outreachApi.createCampaign({
        name,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      });
      setName('');
      setSlug('');
      setSuccess('Campaign created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireAdmin>
      <AdminShell>
        <div className="panel">
          <h1>Outreach campaigns</h1>
          <p className="muted">
            Create campaigns, then attach platform/method/message links for attribution.
          </p>
        </div>

        <div className="panel">
          <h2>Create campaign</h2>
          <form className="stack" onSubmit={onCreate}>
            <div className="row">
              <label>
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Artist Outreach"
                />
              </label>
              <label>
                Slug (optional)
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="leave blank for a random slug"
                />
              </label>
            </div>
            {error ? <p className="error">{error}</p> : null}
            {success ? <p className="success">{success}</p> : null}
            <button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create campaign'}
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Campaigns</h2>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : campaigns.length === 0 ? (
            <p className="muted">No campaigns yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/outreach/campaigns/${c.id}`}>{c.name}</Link>
                    </td>
                    <td className="code">{c.slug}</td>
                    <td>{c.link_count ?? 0}</td>
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
