#!/usr/bin/env node
/**
 * Local log aggregator for `npm run dev:backend`.
 * Accepts POST /log from plugin/UI/stdio bridges, prints prefixed lines,
 * and serves GET /logs for the jamshot-dev-logs MCP tool.
 */

const http = require('http');

const PORT = Number(process.env.DEV_LOG_PORT || 5099);
const MAX_ENTRIES = 5000;

/** @type {Array<{ ts: string, source: string, message: string, level: string }>} */
const ring = [];

function normalizeSource(source) {
  if (!source || typeof source !== 'string') return 'Unknown';
  const trimmed = source.trim();
  if (!trimmed) return 'Unknown';
  // Preserve known terminal tags; otherwise keep as given
  return trimmed;
}

function appendEntry({ source, message, level, ts }) {
  const entry = {
    ts: ts || new Date().toISOString(),
    source: normalizeSource(source),
    message: typeof message === 'string' ? message : String(message ?? ''),
    level: (level || 'info').toLowerCase(),
  };

  ring.push(entry);
  if (ring.length > MAX_ENTRIES) {
    ring.splice(0, ring.length - MAX_ENTRIES);
  }

  const levelTag = entry.level !== 'info' ? ` [${entry.level.toUpperCase()}]` : '';
  process.stdout.write(`[${entry.source}]${levelTag} ${entry.message}\n`);
  return entry;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function getLogs(query) {
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_ENTRIES) : 100;

  let sources = [];
  if (query.sources) {
    sources = String(query.sources)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let entries = ring;
  if (sources.length > 0) {
    const wanted = new Set(sources.map((s) => s.toLowerCase()));
    entries = ring.filter((e) => wanted.has(e.source.toLowerCase()));
  }

  return entries.slice(-limit);
}

function parseQuery(url) {
  const q = {};
  const idx = url.indexOf('?');
  if (idx === -1) return q;
  const params = new URLSearchParams(url.slice(idx + 1));
  for (const [key, value] of params.entries()) {
    q[key] = value;
  }
  return q;
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = req.url || '/';
  const path = url.split('?')[0];

  if (method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, entries: ring.length, port: PORT });
    return;
  }

  if (method === 'GET' && path === '/logs') {
    const logs = getLogs(parseQuery(url));
    sendJson(res, 200, { logs, count: logs.length });
    return;
  }

  if (method === 'POST' && path === '/log') {
    try {
      const body = await parseBody(req);
      if (body.message == null || body.message === '') {
        sendJson(res, 400, { error: 'message is required' });
        return;
      }
      const entry = appendEntry(body);
      sendJson(res, 200, { success: true, entry });
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[DevLog] Listening on http://127.0.0.1:${PORT}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
