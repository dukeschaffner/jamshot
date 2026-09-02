# Sterio (jamshot)

Sterio is a music collaboration product: artists post short clips, and others attach audio as new versions — more like a conversation than a portfolio. The public site is [sterio.fm](https://sterio.fm). This repo is the full stack (web, API, workers, CMS, admin, and the desktop plugin).

Product context, privacy rules, and roadmap live in [`docs/app-notes.txt`](docs/app-notes.txt). Local setup, env keys, and day-to-day workflow live in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Monorepo

| Path | What |
|------|------|
| `ui/` | Next.js web app (`:3000`) |
| `api/lambda/` | Express + Hono API (`:5001` / `:5002`) |
| `cms/` | Payload CMS (`:3001`) |
| `admin/` | Admin app (`:3002`) |
| `plugin/` | JUCE desktop plugin (C++) |
| `functions/lambda/` | Workers (audio, project WebSocket, analytics, competitions, …) |
| `packages/` | Shared JS (`dev-env`, `db-config`, `email`, `subscription-utils`, …) |
| `docs/database/schema/` | Postgres schema |
| `docs/issues/` | Issue backlog (markdown) |

## Prerequisites

- **Node.js 22** (matches CI)
- **PostgreSQL** (local `jamshot` database)
- **npm** (workspaces; run `npm ci` from the repo root)
- **Stripe CLI** if you need payment webhooks locally
- **CMake 3.22+** and **JUCE** only if you work on the plugin — see [`plugin/README.md`](plugin/README.md)

You will also need filled-in values for `env/.env.dev` (database, R2, auth secrets, Stripe test keys). Get those from the team password manager, not from git.

## Quickstart

```bash
git clone <repo-url>
cd jamshot
npm ci

cp env/.env.dev.example env/.env.dev
# Fill in env/.env.dev (see docs/DEVELOPMENT.md)

# Postgres: create the jamshot database, then apply schema
JAMSHOT_ENV=dev node scripts/ephemeral-env/apply-schema.mjs

# Terminal 1 — API, Stripe listen, audio processing, project WebSocket
npm run dev:backend

# Terminal 2 — web app
npm run dev --workspace=ui
```

Open [http://localhost:3000](http://localhost:3000).

Target: clone → UI + API running in under an hour. If something fails, use [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Daily commands

| Command | What it does |
|---------|----------------|
| `npm run dev:backend` | Backend stack via `scripts/run-backend-services.sh` |
| `npm run dev --workspace=ui` | Next.js UI |
| `npm run dev:ephemeral` | Same backend, isolated `sterio-ephemeral` DB + R2 bucket |

Do not point wipe/teardown tools at the interactive `jamshot` database. Isolated tests: [`tests/ai-managed/ephemeral-testing/SKILL.md`](tests/ai-managed/ephemeral-testing/SKILL.md).

## Deploy

Pushes to `dev` deploy **test**. Pushes to `main` deploy **prod** (after test). GitHub Actions workflows live in `.github/workflows/`. Details: [Development — Git and deploy](docs/DEVELOPMENT.md#git-and-deploy).
