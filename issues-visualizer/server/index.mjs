import cors from 'cors';
import express from 'express';
import fs from 'fs/promises';
import matter from 'gray-matter';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ISSUES_ROOT = path.join(REPO_ROOT, 'app documentation', 'issues');
const COMPLETED_DIR = 'completed';

const PORT = Number(process.env.ISSUES_API_PORT || 3050);

function slugify(raw) {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s.slice(0, 80) || 'issue';
}

function issuesResolvedRoot() {
  return path.resolve(ISSUES_ROOT);
}

/** @param {string} relativePath posix-style relative under issues root */
function assertUnderIssuesRoot(relativePath) {
  const parts = String(relativePath)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (parts.some((p) => p === '..' || p === '.')) {
    const err = new Error('Invalid path');
    err.statusCode = 400;
    throw err;
  }
  const full = path.resolve(ISSUES_ROOT, ...parts);
  const root = issuesResolvedRoot();
  if (!full.startsWith(root)) {
    const err = new Error('Invalid path');
    err.statusCode = 400;
    throw err;
  }
  return full;
}

async function ensureIssuesTree() {
  await fs.mkdir(ISSUES_ROOT, { recursive: true });
}

async function walkMarkdownFiles(dir, baseRel = '') {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const ent of entries) {
    const name = ent.name;
    const rel = path.join(baseRel, name);
    const full = path.join(dir, name);
    if (ent.isDirectory()) {
      out.push(...(await walkMarkdownFiles(full, rel)));
    } else if (name.endsWith('.md')) {
      out.push(rel.split(path.sep).join('/'));
    }
  }
  return out;
}

function normalizeRelativePath(relativePath) {
  return String(relativePath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isCompletedRelativePath(relativePath) {
  const rel = normalizeRelativePath(relativePath);
  return rel === COMPLETED_DIR || rel.startsWith(`${COMPLETED_DIR}/`);
}

function visibleIssuePaths(relativePaths) {
  return relativePaths.filter((rel) => !isCompletedRelativePath(rel));
}

async function collectDirectories(dir, baseRel = '', set = new Set()) {
  const normalizedBase = baseRel.split(path.sep).join('/');
  if (isCompletedRelativePath(normalizedBase)) {
    return set;
  }
  set.add(normalizedBase);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return set;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const rel = path.join(baseRel, ent.name);
    if (isCompletedRelativePath(rel)) continue;
    await collectDirectories(path.join(dir, ent.name), rel, set);
  }
  return set;
}

async function readIssue(relativePath) {
  const rel = String(relativePath).replace(/\\/g, '/');
  const full = assertUnderIssuesRoot(rel);
  const raw = await fs.readFile(full, 'utf8');
  const parsed = matter(raw);
  return {
    relativePath: rel,
    frontmatter: parsed.data,
    content: parsed.content,
  };
}

async function maxIssueIdFromDisk() {
  const rels = await walkMarkdownFiles(ISSUES_ROOT);
  let maxId = 0;
  for (const rel of rels) {
    try {
      const { frontmatter } = await readIssue(rel);
      const id = Number(frontmatter?.id);
      if (Number.isFinite(id)) maxId = Math.max(maxId, id);
    } catch {
      /* skip broken files */
    }
  }
  return maxId;
}

function normalizeFrontmatter(body) {
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return {
    id: Number(body.id),
    title: String(body.title ?? '').trim(),
    type: body.type,
    status: body.status,
    priority: Number(body.priority),
    area: String(body.area ?? '').trim(),
    tags,
  };
}

function directoryForStatus(directory, status) {
  const cleanDirectory = normalizeRelativePath(directory);
  if (status !== 'done') {
    if (!isCompletedRelativePath(cleanDirectory)) return cleanDirectory;
    return cleanDirectory.slice(COMPLETED_DIR.length).replace(/^\/+/, '');
  }
  if (isCompletedRelativePath(cleanDirectory)) return cleanDirectory;
  return cleanDirectory ? `${COMPLETED_DIR}/${cleanDirectory}` : COMPLETED_DIR;
}

function validateFrontmatter(fm, { requireId }) {
  const types = new Set(['bug', 'feature', 'tech-debt', 'task']);
  const statuses = new Set(['open', 'in-progress', 'blocked', 'done']);
  if (requireId && !Number.isFinite(fm.id)) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }
  if (!fm.title) {
    const err = new Error('Title is required');
    err.statusCode = 400;
    throw err;
  }
  if (!types.has(fm.type)) {
    const err = new Error('Invalid type');
    err.statusCode = 400;
    throw err;
  }
  if (!statuses.has(fm.status)) {
    const err = new Error('Invalid status');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(fm.priority) || fm.priority < 1 || fm.priority > 10) {
    const err = new Error('Priority must be 1–10');
    err.statusCode = 400;
    throw err;
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function handleError(err, req, res, next) {
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Server error' });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, issuesRoot: ISSUES_ROOT });
});

app.get('/api/directories', async (_req, res, next) => {
  try {
    await ensureIssuesTree();
    const set = await collectDirectories(ISSUES_ROOT);
    const list = [...set].sort((a, b) => a.localeCompare(b));
    res.json({ directories: list });
  } catch (e) {
    next(e);
  }
});

app.get('/api/issues', async (_req, res, next) => {
  try {
    await ensureIssuesTree();
    const rels = visibleIssuePaths(await walkMarkdownFiles(ISSUES_ROOT));
    const issues = [];
    for (const rel of rels) {
      try {
        issues.push(await readIssue(rel));
      } catch {
        /* skip */
      }
    }
    issues.sort((a, b) => {
      const ai = Number(a.frontmatter?.id) || 0;
      const bi = Number(b.frontmatter?.id) || 0;
      return ai - bi;
    });
    res.json({ issues });
  } catch (e) {
    next(e);
  }
});

app.get('/api/issues/one', async (req, res, next) => {
  try {
    const relativePath = String(req.query.path || '');
    if (!relativePath) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const issue = await readIssue(relativePath);
    res.json(issue);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    next(e);
  }
});

app.post('/api/issues', async (req, res, next) => {
  try {
    await ensureIssuesTree();
    const directory = String(req.body.directory ?? '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const content = typeof req.body.content === 'string' ? req.body.content : '';
    const fmPartial = normalizeFrontmatter({
      title: req.body.title,
      type: req.body.type,
      status: req.body.status,
      priority: req.body.priority,
      area: req.body.area,
      tags: req.body.tags,
      id: NaN,
    });
    validateFrontmatter(fmPartial, { requireId: false });

    const nextId = (await maxIssueIdFromDisk()) + 1;
    const fullFm = { ...fmPartial, id: nextId };
    validateFrontmatter(fullFm, { requireId: true });

    const targetDirectory = directoryForStatus(directory, fullFm.status);
    const fileName = `${nextId}-${slugify(fullFm.title)}.md`;
    const relativeFile = targetDirectory ? `${targetDirectory}/${fileName}` : fileName;
    const fullPath = assertUnderIssuesRoot(relativeFile);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    try {
      await fs.access(fullPath);
      res.status(409).json({ error: 'File already exists' });
      return;
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
    }
    const fileBody = matter.stringify(
      content.endsWith('\n') ? content : `${content}\n`,
      fullFm,
    );
    await fs.writeFile(fullPath, fileBody, 'utf8');
    res.status(201).json({ relativePath: relativeFile.split(path.sep).join('/') });
  } catch (e) {
    next(e);
  }
});

app.put('/api/issues', async (req, res, next) => {
  try {
    const oldRelative = String(req.body.oldRelativePath ?? '').trim();
    if (!oldRelative) {
      res.status(400).json({ error: 'oldRelativePath required' });
      return;
    }
    const directory = String(req.body.directory ?? '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const content = typeof req.body.content === 'string' ? req.body.content : '';

    const oldFull = assertUnderIssuesRoot(oldRelative);
    let existing;
    try {
      existing = matter(await fs.readFile(oldFull, 'utf8'));
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      throw e;
    }

    let fm = normalizeFrontmatter({
      title: req.body.title,
      type: req.body.type,
      status: req.body.status,
      priority: req.body.priority,
      area: req.body.area,
      tags: req.body.tags,
      id: req.body.id,
    });
    const diskId = Number(existing.data?.id);
    if (Number.isFinite(diskId)) fm = { ...fm, id: diskId };
    validateFrontmatter(fm, { requireId: true });

    const targetDirectory = directoryForStatus(directory, fm.status);
    const fileName = `${fm.id}-${slugify(fm.title)}.md`;
    const relativeFile = targetDirectory ? `${targetDirectory}/${fileName}` : fileName;
    const newFull = assertUnderIssuesRoot(relativeFile);

    if (newFull !== oldFull) {
      await fs.mkdir(path.dirname(newFull), { recursive: true });
      try {
        await fs.access(newFull);
        res.status(409).json({ error: 'Target path already exists' });
        return;
      } catch (e) {
        if (e && e.code !== 'ENOENT') throw e;
      }
    }

    const fileBody = matter.stringify(
      content.endsWith('\n') ? content : `${content}\n`,
      fm,
    );
    await fs.writeFile(newFull, fileBody, 'utf8');
    if (newFull !== oldFull) {
      try {
        await fs.unlink(oldFull);
      } catch (e) {
        if (e && e.code !== 'ENOENT') throw e;
      }
    }
    res.json({ relativePath: relativeFile.split(path.sep).join('/') });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/issues', async (req, res, next) => {
  try {
    const relativePath = String(req.query.path || '');
    if (!relativePath) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const full = assertUnderIssuesRoot(relativePath);
    try {
      await fs.unlink(full);
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      throw e;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.use(handleError);

await ensureIssuesTree();
app.listen(PORT, () => {
  console.log(`Issues API at http://localhost:${PORT}`);
  console.log(`Issues root: ${ISSUES_ROOT}`);
});
