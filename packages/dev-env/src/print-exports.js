#!/usr/bin/env node
import { loadDevEnv } from './index.js';

function shEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const result = loadDevEnv({ required: true });
if (result.files.length) {
  const names = result.files.map((filePath) => filePath.split('/').slice(-2).join('/'));
  console.error(`[dev-env] loaded ${names.join(' → ')}`);
}

for (const [key, value] of Object.entries(result.vars)) {
  process.stdout.write(`export ${key}=${shEscape(value)}\n`);
}
