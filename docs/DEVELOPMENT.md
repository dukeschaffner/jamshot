# Development

How to run Sterio locally and how the repo is structured for day-to-day work. Product background is in [`app-notes.txt`](app-notes.txt). A short command cheat sheet is in [`run-locally.txt`](run-locally.txt).

## Prerequisites

| Tool | Why |
|------|-----|
| Node.js **22** | CI and local apps. No `.nvmrc` yet; match 22 anyway. |
| PostgreSQL | Local `jamshot` database (and optional `sterio-ephemeral` for isolated tests) |
| npm | Workspaces; always install from the **repo root** |
| Stripe CLI | Payment webhooks. `npm run dev:backend` starts `stripe listen` unless you comment it out |
| CMake 3.22+, JUCE, a C++17 compiler | Plugin only. See [`plugin/README.md`](../plugin/README.md) |

macOS Postgres (Homebrew) is enough:

```bash
brew install postgresql@16
brew services start postgresql@16
```

Create a role that matches `env/.env.dev` (`DB_USER` / `DB_PASSWORD`). Default example uses user `postgres` on `localhost:5432`.

## First-time setup

1. Clone the repo and install from the root (workspaces):

   ```bash
   npm ci
   ```

2. Copy the env template and fill it in. Get secrets from the team password manager — never commit `env/.env.dev`.

   ```bash
   cp env/.env.dev.example env/.env.dev
   ```

   Minimum for UI + API + uploads: database keys, `BETTER_AUTH_SECRET`, `JWT_SECRET`, R2 keys/bucket/public URL, and (for Google sign-in) Google OAuth client credentials. Stripe test keys if you touch billing. See [Environment](#environment).

3. Create the database if it does not exist, then apply schema. `apply-schema.mjs` creates the DB named in `DB_CONNECTION_STRING` and runs `docs/database/schema/*.sql` in FK-safe order. It is **not idempotent** (`CREATE TABLE` fails if tables already exist).

   ```bash
   JAMSHOT_ENV=dev node scripts/ephemeral-env/apply-schema.mjs
   ```

   (`npm run ephemeral:setup` is the same script but forced onto the **ephemeral** overlay. Do not use it for `jamshot`.)

4. Start the backend, then the UI, from the repo root:

   ```bash
   npm run dev:backend
   # other terminal
   npm run dev --workspace=ui
   ```

5. Open [http://localhost:3000](http://localhost:3000). Sign in via email/password or Google, or call the API with the [dev auth header](#auth-testing).

Audio uploads need **R2 `sterio-dev` credentials** and the **audio** worker (on by default in `run-backend-services.sh`). That is the usual first-run gotcha.

## Environment

All local services, UI, CMS, and admin load env through `@sterio/dev-env`. Files apply in order; later files overwrite earlier keys:

1. `env/.env.dev` (required locally)
2. `env/.env.${JAMSHOT_ENV}` if `JAMSHOT_ENV` is set and not `dev`
3. `env/.env.local` (optional machine overlay)
4. `$JAMSHOT_ENV_FILE` or `$DOTENV_PATH` (optional extra overlay)

```bash
cp env/.env.local.example env/.env.local   # only the keys you want to change
JAMSHOT_ENV=ephemeral npm run dev:backend  # uses env/.env.ephemeral on top of .env.dev
```

Delete the overlay (or unset `JAMSHOT_ENV`) to return to `env/.env.dev`. Deployed environments skip this loader (Lambda, CI, Amplify).

`NEXT_PUBLIC_*` values are baked in at Next.js start. Restart the UI after changing them.

### Env key reference

Fill `env/.env.dev` from the password manager. Blank keys in the example are secrets or account-specific.

**App / auth**

| Key | Purpose |
|-----|---------|
| `NODE_ENV` | Use `dev` locally |
| `PORT` | Express API (`5001`) |
| `API_URL` / `FRONTEND_URL` | Server-side links and CORS |
| `BETTER_AUTH_URL` | Better Auth server URL (`http://localhost:5001` in the example; the auth HTTP server actually listens on **5002**) |
| `BETTER_AUTH_SECRET` | Better Auth signing secret |
| `JWT_SECRET` | JWT signing |
| `PASS` | Legacy/misc; leave as provided |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth. Authorized redirect: `http://localhost:5002/api/auth/callback/google` |

**Database**

| Key | Purpose |
|-----|---------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` | Postgres |
| `DB_CONNECTION_STRING` | Same DB as a URL; keep in sync with the fields above |
| `CMS_DATABASE_URL` | Payload CMS Postgres URL (CMS only) |

**R2 / CDN**

| Key | Purpose |
|-----|---------|
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` | Cloudflare R2 |
| `R2_BUCKET` | API / audio / video bucket (`sterio-dev` locally) |
| `R2_BUCKET_NAME` | Plugin upload bucket (often the same as `R2_BUCKET` in dev) |
| `R2_PUBLIC_URL` / `NEXT_PUBLIC_R2_PUBLIC_URL` | Public CDN/base URL for objects |

**Stripe (test mode)**

| Key | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Test keys |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen` (`whsec_…`) |
| `STRIPE_*_PRICE_ID` | Test price IDs for Basic, Premium, and team plans |

**Email**

| Key | Purpose |
|-----|---------|
| `EMAIL` / `EMAIL_PASSWORD` / `SMTP_*` | Outbound mail. Local signup often prints verification URLs in API logs instead |
| `TEST_EMAIL` | Optional override for notification testing |

**UI / analytics / CMS**

| Key | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5001/api` |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | `http://localhost:5002/api` |
| `NEXT_PUBLIC_PROJECT_WS_URL` | `ws://localhost:5003` |
| `CMS_URL` / `NEXT_PUBLIC_CMS_URL` | Payload (`http://localhost:3001`) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional locally |
| `NEXT_PUBLIC_POSTHOG_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional locally |
| `PAYLOAD_SECRET` / `PREVIEW_SECRET` | CMS only |
| `AWS_*` | Not required for typical local UI/API work |
| `IPGEO_API_KEY` | Listener geolocation |
| `PLUGIN_META` | JSON string, e.g. `{"currentVersion":"0.1.3","minSupportedVersion":"0.1.0"}` |

## Daily workflow

Default local stack:

```text
Terminal 1:  npm run dev:backend
Terminal 2:  npm run dev --workspace=ui
```

`dev:backend` starts DevLog on `:5099`, then the services listed in `scripts/run-backend-services.sh`. Comment out lines in the `SERVICES=(...)` array to skip a process. Ctrl+C stops everything the script started.

On by default: **api**, **stripe**, **audio**, **project-ws**.  
Commented out: **video**, **email**, **issues**.

UI logs in local Next.js POST to DevLog (`[UI]`). Plugin debug builds can do the same (`[Plugin]`). Cursor MCP `sterio-local-logs` / `get_local_logs` reads that buffer after `cd scripts/dev-log-mcp && npm install` and a Cursor MCP reload.

### Ports

| Port | Service |
|------|---------|
| 3000 | UI |
| 3001 | CMS (optional) |
| 3002 | Admin (optional) |
| 5001 | Express API |
| 5002 | Hono / Better Auth |
| 5003 | Project WebSocket |
| 5099 | DevLog |
| 3050 | Issues visualizer API (optional) |

Interactive `jamshot` and ephemeral mode **share these ports**. Stop one stack before starting the other.

### Optional processes

```bash
cd cms && npm run dev          # :3001
cd admin && npm run dev        # :3002
cd issues-visualizer && npm run dev
# or uncomment video / email / issues in run-backend-services.sh
```

Video export and email notification lambdas also have one-off local entrypoints documented in [`run-locally.txt`](run-locally.txt).

Wipe **all** project rows on the current API database (destructive):

```bash
cd api/lambda && npm run wipe-projects:confirm
```

## Database

- Canonical schema: `docs/database/schema/{name}.sql` (one file per table or logical group).
- Schema changes: add a migration at `docs/database/migrations/{dd-mm-yy}-{name}.sql` **and** update the matching schema file.
- Apply a **new** local database with `JAMSHOT_ENV=dev node scripts/ephemeral-env/apply-schema.mjs`.
- Apply a migration to an **existing** database with `psql` (or any Postgres client) against that environment. Someone with access runs migrations on test/prod; do not apply prod migrations from a laptop without an explicit request.
- Fresh schema apply is not idempotent. For disposable test DBs, prefer teardown + setup (ephemeral only).

## Auth testing

**Browser:** register / login on `:3000`. Email verification URLs are printed in API logs locally (`[DEV EMAIL] verification url…`). Google OAuth needs the local redirect URI on the Google client.

**API (local only):** spoof a user with header `x-dev-user-id`. The usual jamshot seed id is:

```http
x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE
```

That row must exist in the current database. On a new `jamshot` DB, sign up once in the UI or insert a user. On ephemeral, seed explicitly — see [Ephemeral testing](#ephemeral-testing). Do not use this header against test/prod.

## Stripe

`npm run dev:backend` runs:

```bash
stripe listen --forward-to localhost:5001/api/payments/webhook
```

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), run `stripe login` if the session expired, and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. Use **test** keys only.

If you are not touching payments, comment `stripe` out of `SERVICES` so a CLI/login failure does not take down the whole backend script (any child exit stops the rest).

## Ephemeral testing

Use this when tests must not touch interactive `jamshot` data or the `sterio-dev` R2 bucket. Full checklist: [`tests/ai-managed/ephemeral-testing/SKILL.md`](../tests/ai-managed/ephemeral-testing/SKILL.md).

| | Interactive | Ephemeral |
|---|-------------|-----------|
| Postgres | `jamshot` | `sterio-ephemeral` |
| R2 | `sterio-dev` | `sterio-ephemeral` (real Cloudflare bucket) |

```bash
# env/.env.ephemeral must exist (DB name + R2 bucket/public URL overrides)
npm run ephemeral:teardown    # drop DB if present
npm run ephemeral:setup       # create DB, apply schema
npm run ephemeral:wipe        # truncate tables (except feature_flags); empty ephemeral R2
npm run dev:ephemeral         # backend
JAMSHOT_ENV=ephemeral npm run dev --workspace=ui
```

Wipe and teardown refuse to run unless `JAMSHOT_ENV=ephemeral` and the database/bucket names contain `ephemeral`. Never point them at `jamshot`.

## Plugin

Local plugin build and host-DAW testing: [`plugin/README.md`](../plugin/README.md).

Release (macOS): bump version in `Config.h`, `CMakeLists.txt`, and `plugin/scripts/create-plugin-pkg.sh`; point `Config.h` at prod URLs; then `build-release.sh` → `sign-plugins.sh` → `create-plugin-pkg.sh` → `notarize-pkg.sh` → `upload-to-r2.sh`. Update API `PLUGIN_META` to the new version. Windows upload: `plugin/scripts/upload-windows-release.ps1`.

Do not block the audio thread in plugin code.

## Git and deploy

CI (`.github/workflows/deploy-*.yml`):

- Push to **`dev`** → build and deploy **test**.
- Push to **`main`** → deploy **test**, then **prod**.
- `workflow_dispatch` can target test or prod manually.

Path filters mean a UI-only change does not redeploy Lambdas, and vice versa. Shared `packages/*` must be listed in a workflow’s `paths` if that deployable should rebuild when the package changes.

**Working agreement:** branch from `dev`, open a PR into `dev`, verify on test, then promote to `main` for prod. New developers should not get prod AWS, Neon prod, or production R2. Test/prod env vars live in GitHub Actions secrets and AWS — not in this repo.

## Conventions

- Prefer a **new file** for new behavior; do not grow monoliths.
- **UI:** call the existing API clients (e.g. `userApi`); prefer shadcn (`npx shadcn@latest add …`); use shimmering skeletons for loading; log with `ui/src/lib/logger.js`.
- **API:** keep routes thin; business logic in services; helpers in utils; user-facing error messages only; always call `next` on error in Express middleware.
- **CSS:** CSS modules, existing variables and util classes.
- **Web DAW:** UI-only knobs in `DAWConfig.js` / `ProjectsConfig.js`; values shared with the API go in `packages/`.
- **Shared packages:** if a deployable starts depending on a package, add that package path to the deploy workflow `paths`. Third-party deps of a shared package must also be declared on the consumer `package.json`.

## Issues

Backlog is markdown under [`docs/issues/`](issues/). Frontmatter: `id`, `title`, `type` (`bug` | `feature` | `tech-debt` | `task`), `status`, `priority` (1–10, **10** is highest), `area`, `tags`. Completed items live under `docs/issues/completed/`. Creating issues via the visualizer API is described in [`.cursor/skills/jamshot-issues/SKILL.md`](../.cursor/skills/jamshot-issues/SKILL.md).

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `Local env file not found` | Copy `env/.env.dev.example` → `env/.env.dev` |
| Backend exits immediately | One child died. Stripe CLI not logged in is common — `stripe login`, or comment `stripe` out of `SERVICES` |
| Uploads hang / never process | R2 keys/bucket; audio worker running; `R2_PUBLIC_URL` / `NEXT_PUBLIC_R2_PUBLIC_URL` |
| Auth / Google redirect errors | Redirect URI `http://localhost:5002/api/auth/callback/google`; UI `NEXT_PUBLIC_BETTER_AUTH_URL` is `:5002/api` |
| `x-dev-user-id` 401/empty | User row missing in **this** database (especially after ephemeral wipe) |
| Port already in use | `jamshot` and ephemeral cannot run at once; stop the other stack |
| Schema apply fails with “already exists” | DB is not empty. Use a new database name, or ephemeral teardown+setup |
| UI missing API/R2 after env edit | Restart `npm run dev --workspace=ui` so `NEXT_PUBLIC_*` reload |
