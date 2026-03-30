import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteIssue, fetchIssues } from '../api';
import type { IssueDoc, IssueStatus, IssueType } from '../types';

const TYPES: IssueType[] = ['bug', 'feature', 'tech-debt', 'task'];
const STATUSES: IssueStatus[] = ['open', 'in-progress', 'blocked', 'done'];

function coerceStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function coerceTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => coerceStr(x).trim()).filter(Boolean);
}

function normalizeIssue(doc: IssueDoc): IssueDoc {
  const fm = doc.frontmatter;
  return {
    ...doc,
    frontmatter: {
      id: Number(fm.id) || 0,
      title: coerceStr(fm.title),
      type: (TYPES.includes(fm.type as IssueType) ? fm.type : 'feature') as IssueType,
      status: (STATUSES.includes(fm.status as IssueStatus) ? fm.status : 'open') as IssueStatus,
      priority: Math.min(10, Math.max(1, Number(fm.priority) || 1)),
      area: coerceStr(fm.area),
      tags: coerceTags(fm.tags),
    },
  };
}

export function HomePage() {
  const [issues, setIssues] = useState<IssueDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeSel, setTypeSel] = useState<Set<IssueType>>(new Set());
  const [statusSel, setStatusSel] = useState<Set<IssueStatus>>(new Set());
  const [tagSel, setTagSel] = useState<Set<string>>(new Set());
  const [areaFilter, setAreaFilter] = useState('');
  const [pMin, setPMin] = useState(1);
  const [pMax, setPMax] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { issues: rows } = await fetchIssues();
      setIssues(rows.map(normalizeIssue));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const i of issues) for (const t of i.frontmatter.tags) s.add(t);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((doc) => {
      const fm = doc.frontmatter;
      if (q) {
        const hay = [
          fm.title,
          fm.area,
          doc.content,
          ...fm.tags,
        ]
          .join('\n')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeSel.size && !typeSel.has(fm.type)) return false;
      if (statusSel.size && !statusSel.has(fm.status)) return false;
      if (fm.priority < pMin || fm.priority > pMax) return false;
      if (areaFilter.trim()) {
        if (!fm.area.toLowerCase().includes(areaFilter.trim().toLowerCase())) return false;
      }
      if (tagSel.size) {
        for (const t of tagSel) {
          if (!fm.tags.includes(t)) return false;
        }
      }
      return true;
    });
  }, [issues, search, typeSel, statusSel, tagSel, areaFilter, pMin, pMax]);

  function toggle<T extends string>(set: Set<T>, v: T, next: (s: Set<T>) => void) {
    const copy = new Set(set);
    if (copy.has(v)) copy.delete(v);
    else copy.add(v);
    next(copy);
  }

  async function onDelete(path: string) {
    if (!confirm(`Delete issue file?\n${path}`)) return;
    try {
      await deleteIssue(path);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <p className="muted" style={{ margin: 0 }}>
          {loading ? 'Loading…' : `${filtered.length} of ${issues.length} issues`}
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <div className="err">{error}</div> : null}

      <section className="filters" aria-label="Filters">
        <div className="filters-row">
          <div className="field" style={{ flex: '2 1 200px' }}>
            <label htmlFor="q">Search</label>
            <input
              id="q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, area, tags, description…"
              autoComplete="off"
            />
          </div>
          <div className="field" style={{ maxWidth: '120px' }}>
            <label htmlFor="pmin">Priority min</label>
            <input
              id="pmin"
              type="number"
              min={1}
              max={10}
              value={pMin}
              onChange={(e) => setPMin(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="field" style={{ maxWidth: '120px' }}>
            <label htmlFor="pmax">Priority max</label>
            <input
              id="pmax"
              type="number"
              min={1}
              max={10}
              value={pMax}
              onChange={(e) => setPMax(Math.min(10, Math.max(1, Number(e.target.value) || 10)))}
            />
          </div>
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label htmlFor="area">Area contains</label>
            <input
              id="area"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              placeholder="e.g. audio-upload"
            />
          </div>
        </div>
        <div className="chip-group">
          <span>Type (multi)</span>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              data-on={typeSel.has(t) ? 'true' : 'false'}
              onClick={() => toggle(typeSel, t, setTypeSel)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="chip-group">
          <span>Status (multi)</span>
          {STATUSES.map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              data-on={statusSel.has(t) ? 'true' : 'false'}
              onClick={() => toggle(statusSel, t, setStatusSel)}
            >
              {t}
            </button>
          ))}
        </div>
        {allTags.length ? (
          <div className="chip-group">
            <span>Tags (must include all selected)</span>
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                data-on={tagSel.has(t) ? 'true' : 'false'}
                onClick={() => toggle(tagSel, t, setTagSel)}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="issue-list">
        {filtered.map((doc) => {
          const fm = doc.frontmatter;
          const preview = doc.content.trim().split('\n').slice(0, 2).join('\n');
          return (
            <article key={doc.relativePath} className="issue-card">
              <div>
                <h2>
                  #{fm.id} · {fm.title}
                </h2>
                <div className="issue-meta">
                  <span className="badge">{fm.type}</span>
                  <span className="badge">{fm.status}</span>
                  <span>
                    priority {fm.priority} · {fm.area || '—'}
                  </span>
                  <span className="muted">{doc.relativePath}</span>
                </div>
                {preview ? <div className="issue-preview">{preview}</div> : null}
              </div>
              <div className="issue-actions">
                <Link className="btn btn-primary" to={`/edit?path=${encodeURIComponent(doc.relativePath)}`}>
                  Edit
                </Link>
                <button type="button" className="btn btn-danger" onClick={() => void onDelete(doc.relativePath)}>
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && issues.length === 0 ? (
        <p className="muted">No issues yet. Create one under &quot;New issue&quot;.</p>
      ) : null}
    </>
  );
}
