import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..');
export const ENV_DIR = path.join(REPO_ROOT, 'env');

const SKIP_REASONS = [
  ['AWS_LAMBDA_FUNCTION_NAME', 'lambda'],
  ['CI', 'ci'],
  ['VERCEL', 'vercel'],
  ['AWS_APP_ID', 'amplify'],
  ['SKIP_DEV_ENV', 'skip'],
];

let cached = null;

function shouldSkip() {
  for (const [key, reason] of SKIP_REASONS) {
    if (process.env[key]) {
      return reason;
    }
  }
  return null;
}

function parseFile(filePath) {
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  const vars = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      vars[key] = value;
    }
  }
  return vars;
}

function applyVars(vars) {
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value;
  }
}

function existingFile(filePath) {
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Files applied in order (later files overwrite earlier keys):
 *   1. env/.env.dev                         (required locally)
 *   2. env/.env.${JAMSHOT_ENV}              (if JAMSHOT_ENV is set and not "dev")
 *   3. env/.env.local                       (optional machine overlay)
 *   4. $JAMSHOT_ENV_FILE or $DOTENV_PATH    (optional extra overlay)
 *
 * Switch the whole repo to a temporary overlay:
 *   JAMSHOT_ENV=ephemeral npm run dev:backend
 *   # with env/.env.ephemeral containing only the keys to change
 *
 * Or drop overrides in env/.env.local and delete that file to revert.
 *
 * @param {{ required?: boolean }} [options]
 */
export function loadDevEnv(options = {}) {
  const required = options.required !== false;

  if (cached) {
    return cached;
  }

  const skipReason = shouldSkip();
  if (skipReason) {
    cached = { skipped: skipReason, files: [], vars: {} };
    return cached;
  }

  const profile = process.env.JAMSHOT_ENV || 'dev';
  const files = [];
  const vars = {};

  const basePath = path.join(ENV_DIR, '.env.dev');
  if (!fs.existsSync(basePath)) {
    const message =
      `Local env file not found at ${basePath}. Copy env/.env.dev.example to env/.env.dev and fill in values.`;
    if (required) {
      throw new Error(message);
    }
    cached = { skipped: 'missing', files: [], vars: {} };
    return cached;
  }

  const extraPath = process.env.JAMSHOT_ENV_FILE || process.env.DOTENV_PATH || '';
  const extraResolved = extraPath
    ? (path.isAbsolute(extraPath) ? extraPath : path.resolve(process.cwd(), extraPath))
    : null;

  const stack = [
    basePath,
    profile !== 'dev' ? path.join(ENV_DIR, `.env.${profile}`) : null,
    path.join(ENV_DIR, '.env.local'),
    extraResolved,
  ];

  for (const filePath of stack) {
    const existing = filePath && existingFile(filePath);
    if (!existing) {
      if (filePath && (filePath === extraResolved || (profile !== 'dev' && filePath.endsWith(`.env.${profile}`)))) {
        if (required && filePath === extraResolved) {
          throw new Error(`JAMSHOT_ENV_FILE/DOTENV_PATH not found: ${filePath}`);
        }
        if (required && profile !== 'dev' && filePath.endsWith(`.env.${profile}`)) {
          throw new Error(
            `JAMSHOT_ENV=${profile} but ${filePath} does not exist. Create it with the keys you want to override.`
          );
        }
      }
      continue;
    }
    Object.assign(vars, parseFile(existing));
    files.push(existing);
  }

  applyVars(vars);
  cached = { skipped: null, files, vars, profile };
  if (files.length > 1 || profile !== 'dev') {
    const names = files.map((filePath) => path.relative(REPO_ROOT, filePath));
    console.error(`[dev-env] ${profile}: ${names.join(' → ')}`);
  }
  return cached;
}

export function getLoadedDevEnv() {
  return cached;
}
