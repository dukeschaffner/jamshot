#!/usr/bin/env node
/**
 * Pipes stdin lines to the local dev-log-server (POST /log).
 * Does not print — the log server owns terminal output.
 *
 * Usage: some-command 2>&1 | node bridge.js --source API
 */

const http = require('http');
const readline = require('readline');

const PORT = Number(process.env.DEV_LOG_PORT || 5099);

function parseSource(argv) {
  const idx = argv.indexOf('--source');
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return 'Unknown';
}

const source = parseSource(process.argv.slice(2));

function postLog(message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ source, message, level: 'info' });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/log',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.on('error', () => resolve());
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
    req.write(body);
    req.end();
  });
}

// Serialize posts so line order is preserved under backpressure
let chain = Promise.resolve();

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  chain = chain.then(() => postLog(line));
});

rl.on('close', () => {
  chain.finally(() => process.exit(0));
});

process.stdin.on('error', () => {
  chain.finally(() => process.exit(0));
});
