import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createIssue, fetchDirectories } from '../api';
import type { IssueStatus, IssueType } from '../types';

const TYPES: IssueType[] = ['bug', 'feature', 'tech-debt', 'task'];
const STATUSES: IssueStatus[] = ['open', 'in-progress', 'blocked', 'done'];

function parseTags(raw: string): string[] {
  return raw
    .split(/[,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CreatePage() {
  const nav = useNavigate();
  const [dirs, setDirs] = useState<string[]>(['']);
  const [dirMode, setDirMode] = useState<'pick' | 'custom'>('pick');
  const [dirPick, setDirPick] = useState('');
  const [dirCustom, setDirCustom] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<IssueType>('feature');
  const [status, setStatus] = useState<IssueStatus>('open');
  const [priority, setPriority] = useState(5);
  const [area, setArea] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { directories } = await fetchDirectories();
        if (cancelled) return;
        const sorted = [...directories].sort((a, b) => a.localeCompare(b));
        setDirs(sorted.includes('') ? sorted : ['', ...sorted]);
      } catch {
        if (!cancelled) setDirs(['']);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveDirectory = useMemo(() => {
    if (dirMode === 'custom') return dirCustom.trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
    return (dirPick || '').trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
  }, [dirMode, dirPick, dirCustom]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    try {
      await createIssue({
        directory: effectiveDirectory,
        title: title.trim(),
        type,
        status,
        priority,
        area: area.trim(),
        tags: parseTags(tagsRaw),
        content,
      });
      nav('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← Back</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>New issue</h2>
      {error ? <div className="err">{error}</div> : null}
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label>Directory</label>
          <select
            value={dirMode}
            onChange={(e) => setDirMode(e.target.value === 'custom' ? 'custom' : 'pick')}
            aria-label="Directory mode"
          >
            <option value="pick">Choose existing folder</option>
            <option value="custom">Custom path (create if missing)</option>
          </select>
        </div>
        {dirMode === 'pick' ? (
          <div className="field">
            <label htmlFor="dir-pick">Folder under issues</label>
            <select id="dir-pick" value={dirPick} onChange={(e) => setDirPick(e.target.value)}>
              {dirs.map((d) => (
                <option key={d || 'root'} value={d}>
                  {d === '' ? '(repository root)' : d}
                </option>
              ))}
            </select>
            <span className="field-hint">New folders appear after you create issues in them or add them on disk.</span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="dir-custom">Relative path</label>
            <input
              id="dir-custom"
              value={dirCustom}
              onChange={(e) => setDirCustom(e.target.value)}
              placeholder="e.g. audio-upload or milestones/q2"
              autoComplete="off"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="type">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value as IssueType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)}>
            {STATUSES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="priority">Priority (1–10)</label>
          <input
            id="priority"
            type="number"
            min={1}
            max={10}
            value={priority}
            onChange={(e) => setPriority(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="field">
          <label htmlFor="area">Area</label>
          <input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. audio-upload" />
        </div>
        <div className="field">
          <label htmlFor="tags">Tags</label>
          <input
            id="tags"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="comma-separated"
          />
        </div>
        <div className="field">
          <label htmlFor="body">Description (markdown)</label>
          <textarea id="body" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Create issue'}
          </button>
          <Link to="/" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
