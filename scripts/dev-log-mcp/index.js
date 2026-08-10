#!/usr/bin/env node
/**
 * MCP server: read recent logs from the local DevLog aggregator
 * started by `npm run dev:backend` (http://127.0.0.1:5099).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const DEV_LOG_PORT = Number(process.env.DEV_LOG_PORT || 5099);
const DEV_LOG_BASE = `http://127.0.0.1:${DEV_LOG_PORT}`;

async function fetchLogs({ limit, sources }) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (sources && sources.length > 0) {
    params.set('sources', sources.join(','));
  }

  const url = `${DEV_LOG_BASE}/logs?${params.toString()}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `DevLog server unreachable at ${DEV_LOG_BASE} (${message}). Start it with: npm run dev:backend`
    );
  }

  if (!response.ok) {
    throw new Error(`DevLog server returned HTTP ${response.status}`);
  }

  return response.json();
}

function formatLogs(logs) {
  if (!logs.length) {
    return 'No log entries matched.';
  }

  return logs
    .map((entry) => {
      const levelTag = entry.level && entry.level !== 'info' ? ` [${String(entry.level).toUpperCase()}]` : '';
      return `[${entry.ts}] [${entry.source}]${levelTag} ${entry.message}`;
    })
    .join('\n');
}

const server = new McpServer({
  name: 'jamshot-dev-logs',
  version: '1.0.0',
});

server.tool(
  'get_local_logs',
  'Read the last N log lines from the local unified DevLog terminal aggregator (API, Stripe, Audio, ProjectWS, UI, Plugin, etc.). Omit sources to include all processes.',
  {
    limit: z
      .number()
      .int()
      .positive()
      .max(5000)
      .optional()
      .describe('Number of recent log entries to return (default 100)'),
    sources: z
      .array(z.string())
      .optional()
      .describe(
        'Optional process filters, e.g. ["API","UI","Plugin","Stripe","Audio","ProjectWS"]. Case-insensitive. Omit for all.'
      ),
  },
  async ({ limit = 100, sources }) => {
    try {
      const data = await fetchLogs({ limit, sources });
      const text = formatLogs(data.logs || []);
      return {
        content: [
          {
            type: 'text',
            text: `${text}\n\n(${data.count ?? 0} entries)`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`jamshot-dev-logs MCP listening (DevLog :${DEV_LOG_PORT})`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
