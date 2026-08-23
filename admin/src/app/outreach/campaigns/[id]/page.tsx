'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminShell } from '@/components/AdminShell';
import { RequireAdmin } from '@/components/RequireAdmin';
import {
  MessageVariantField,
  type MessageVariantFieldHandle,
} from '@/components/MessageVariantField';
import {
  CopyOutreachMessage,
  copyOutreachMessage,
} from '@/components/CopyOutreachMessage';
import { OutreachDestinationField } from '@/components/OutreachDestinationField';
import { resolveOutreachMessageBody } from '@/lib/formatOutreachMessage';
import {
  outreachApi,
  type OutreachCampaign,
  type OutreachLink,
  type OutreachMessageVariant,
} from '@/lib/outreachApi';

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = Number(params.id);

  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [links, setLinks] = useState<OutreachLink[]>([]);
  const [variants, setVariants] = useState<OutreachMessageVariant[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);

  const [messageVariantId, setMessageVariantId] = useState('');
  const [platform, setPlatform] = useState('');
  const [method, setMethod] = useState('');
  const [artistHandle, setArtistHandle] = useState('');
  const [destinationPath, setDestinationPath] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdMessageBody, setCreatedMessageBody] = useState('');
  const [copiedOnCreate, setCopiedOnCreate] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const variantFieldRef = useRef<MessageVariantFieldHandle>(null);

  async function load() {
    if (!Number.isFinite(campaignId)) {
      setError('Invalid campaign');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [detail, variantData, meta] = await Promise.all([
        outreachApi.getCampaign(campaignId),
        outreachApi.listMessageVariants(),
        outreachApi.getMeta(),
      ]);
      setCampaign(detail.campaign);
      setLinks(detail.links);
      setVariants(variantData.messageVariants);
      setPlatforms(meta.platforms);
      setMethods(meta.methods);
      if (!platform && meta.platforms[0]) setPlatform(meta.platforms[0]);
      if (!method && meta.methods[0]) setMethod(meta.methods[0]);
      if (!messageVariantId && variantData.messageVariants[0]) {
        setMessageVariantId(String(variantData.messageVariants[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function onCreateLink(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setCreatedUrl('');
    setCreatedMessageBody('');
    setCopiedOnCreate(false);
    try {
      const resolvedVariant = await variantFieldRef.current?.resolveVariant();
      if (!resolvedVariant) {
        throw new Error('Select or create a message variant');
      }

      const { link } = await outreachApi.createLink({
        campaignId,
        messageVariantId: resolvedVariant.id,
        platform,
        method,
        ...(artistHandle.trim()
          ? { artistHandle: artistHandle.trim() }
          : {}),
        ...(destinationPath.trim()
          ? { destinationPath: destinationPath.trim() }
          : {}),
      });
      const messageBody =
        link.message_variant_body ||
        resolvedVariant.body ||
        resolveOutreachMessageBody(
          null,
          variants,
          link.message_variant_id
        );
      setCreatedUrl(link.short_url);
      setCreatedMessageBody(messageBody);
      const copied = await copyOutreachMessage(messageBody, link.short_url);
      setCopiedOnCreate(copied);
      setArtistHandle('');
      setDestinationPath('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }

  return (
    <RequireAdmin>
      <AdminShell>
        <div className="panel">
          <p className="muted">
            <Link href="/outreach">← Campaigns</Link>
          </p>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : campaign ? (
            <>
              <h1>{campaign.name}</h1>
              <p className="muted code">utm_campaign={campaign.slug}</p>
            </>
          ) : (
            <p className="error">Campaign not found</p>
          )}
        </div>

        {campaign ? (
          <>
            <div className="panel">
              <h2>Create outreach link</h2>
              <form className="stack" onSubmit={onCreateLink}>
                <div className="row">
                  <label>
                    Platform
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      required
                    >
                      {platforms.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Method
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      required
                    >
                      {methods.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Artist (optional)
                    <input
                      value={artistHandle}
                      onChange={(e) => setArtistHandle(e.target.value)}
                      placeholder="@artistname"
                    />
                  </label>
                </div>
                <MessageVariantField
                  ref={variantFieldRef}
                  variants={variants}
                  value={messageVariantId}
                  onChange={setMessageVariantId}
                  onCreated={(variant) => {
                    setVariants((current) => [variant, ...current]);
                    setMessageVariantId(String(variant.id));
                  }}
                />
                <OutreachDestinationField
                  value={destinationPath}
                  onChange={setDestinationPath}
                />
                {error ? <p className="error">{error}</p> : null}
                {createdUrl ? (
                  <div className="stack">
                    <div className="copy-row">
                      <span className="success code">{createdUrl}</span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => copyUrl(createdUrl)}
                      >
                        Copy URL
                      </button>
                    </div>
                    {createdMessageBody ? (
                      <CopyOutreachMessage
                        body={createdMessageBody}
                        shortUrl={createdUrl}
                        showResolved
                      />
                    ) : null}
                    {copiedOnCreate ? (
                      <p className="success">Message copied to clipboard</p>
                    ) : null}
                  </div>
                ) : null}
                <button type="submit" disabled={saving}>
                  {saving ? 'Creating…' : 'Generate link'}
                </button>
              </form>
            </div>

            <div className="panel">
              <h2>Links</h2>
              {links.length === 0 ? (
                <p className="muted">No links for this campaign yet.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Method</th>
                        <th>Message</th>
                        <th>Artist</th>
                        <th>Destination</th>
                        <th>Short URL</th>
                        <th>Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {links.map((link) => (
                        <tr key={link.id}>
                          <td>{link.platform}</td>
                          <td>{link.method}</td>
                          <td className="message-cell">
                            <CopyOutreachMessage
                              body={resolveOutreachMessageBody(
                                link.message_variant_body,
                                variants,
                                link.message_variant_id
                              )}
                              shortUrl={link.short_url}
                              variantLabel={
                                link.message_variant_slug ||
                                String(link.message_variant_id)
                              }
                            />
                          </td>
                          <td>{link.artist_handle ? `@${link.artist_handle}` : '—'}</td>
                          <td className="code">{link.destination_path || '/'}</td>
                          <td>
                            <div className="copy-row">
                              <span className="code">{link.short_url}</span>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => copyUrl(link.short_url)}
                              >
                                Copy
                              </button>
                            </div>
                          </td>
                          <td>{link.click_count ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </AdminShell>
    </RequireAdmin>
  );
}
