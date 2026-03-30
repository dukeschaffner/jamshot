import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchDirectories, fetchIssue, updateIssue } from '../api';
import type { IssueStatus, IssueType } from '../types';

const TYPES: IssueType[] = ['bug', 'feature', 'tech-debt'];
const STATUSES: IssueStatus[] = ['open', 'in-progress', 'blocked', 'done'];

function parseTags(raw: string): string[] {
  return raw
    .split(/[,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parentDir(relativePath: string): string {
  const n = relativePath.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i === -1 ? '' : n.slice(0, i);
}

export function EditPage() {
  const [params] = useSearchParams();
  const pathParam = params.get('path') || '';
  const nav = useNavigate();

  const [dirs, setDirs] = useState<string[]>(['']);
  const [dirMode, setDirMode] = useState<'pick' | 'custom'>('pick');
  const [dirPick, setDirPick] = useState('');
  const [dirCustom, setDirCustom] = useState('');
  const [oldRelativePath, setOldRelativePath] = useState('');

  const [title, setTitle] = useState('');
  const [type, setType] = useState<IssueType>('feature');
  const [status, setStatus] = useState<IssueStatus>('open');
  const [priority, setPriority] = useState(5);
  const [area, setArea] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!pathParam) {
      setLoading(false);
      setError('Missing path');
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await fetchIssue(pathParam);
        if (cancelled) return;
        const fm = doc.frontmatter;
        const parent = parentDir(doc.relativePath);
        setOldRelativePath(doc.relativePath);
        setTitle(String(fm.title ?? ''));
        setType((TYPES.includes(fm.type as IssueType) ? fm.type : 'feature') as IssueType);
        setStatus((STATUSES.includes(fm.status as IssueStatus) ? fm.status : 'open') as IssueStatus);
        setPriority(Math.min(10, Math.max(1, Number(fm.priority) || 1)));
        setArea(String(fm.area ?? ''));
        setTagsRaw(Array.isArray(fm.tags) ? fm.tags.map(String).join(', ') : '');
        setContent(doc.content);
        setDirPick(parent);
        setDirCustom(parent);
        setDirMode('pick');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathParam]);

  const effectiveDirectory = useMemo(() => {
    if (dirMode === 'custom') return dirCustom.trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
    return (dirPick || '').trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
  }, [dirMode, dirPick, dirCustom]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!oldRelativePath) {
      setError('Missing issue path');
      return;
    }
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    try {
      await updateIssue({
        oldRelativePath,
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

  if (!pathParam) {
    return (
      <p>
        <Link to="/">← Back</Link>
      </p>
    );
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link to="/">← Back</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>Edit issue</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {oldRelativePath}
      </p>
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
            <option value="custom">Custom path</option>
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
          </div>
        ) : (
          <div className="field">
            <label htmlFor="dir-custom">Relative path</label>
            <input
              id="dir-custom"
              value={dirCustom}
              onChange={(e) => setDirCustom(e.target.value)}
              placeholder="e.g. audio-upload"
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
          <input id="area" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tags">Tags</label>
          <input id="tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="comma-separated" />
        </div>
        <div className="field">
          <label htmlFor="body">Description (markdown)</label>
          <textarea id="body" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <Link to="/" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
