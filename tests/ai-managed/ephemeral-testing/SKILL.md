---
name: ephemeral-testing
description: Isolated local testing against the sterio-ephemeral Postgres database and sterio-ephemeral R2 bucket. Use when starting a new ephemeral test, running AI-managed local tests, or when jamshot/dev data must not be touched.
---

# Ephemeral testing

Run the app against a disposable local Postgres database and a dedicated Cloudflare R2 bucket so tests cannot pollute interactive `jamshot` / `sterio-dev` data.

## Targets

| | Interactive dev | Ephemeral |
|---|---|---|
| Postgres | `jamshot` | `sterio-ephemeral` |
| R2 | `sterio-dev` (from `env/.env.dev`) | `sterio-ephemeral` (real Cloudflare bucket, not an emulator) |
| MCP SQL | `sterio-local-db` | `sterio-ephemeral-db` |

Overlay file: `env/.env.ephemeral` (DB name + R2 bucket/public URL only). Loaded on top of `env/.env.dev` when `JAMSHOT_ENV=ephemeral`.

Never query or wipe `jamshot`. Never point wipe/teardown at a database or bucket whose name does not contain `ephemeral`.

## Start a new ephemeral test

Copy this checklist and complete it in order:

```
- [ ] Overlay exists: env/.env.ephemeral
- [ ] Schema applied (setup or teardown+setup)
- [ ] Data/R2 cleaned (wipe) unless this is a brand-new setup
- [ ] jamshot backend on :5001/:5002 stopped
- [ ] Backend started with JAMSHOT_ENV=ephemeral
- [ ] Confirmed [dev-env] ephemeral overlay in process output
- [ ] Seeded a user if using x-dev-user-id
```

1. **Overlay.** `env/.env.ephemeral` must exist. Template shape is in `env/.env.local.example`.
2. **Schema.** First time, or after schema files changed:
   ```bash
   npm run ephemeral:teardown   # no-op if the DB does not exist
   npm run ephemeral:setup      # create sterio-ephemeral, apply docs/database/schema
   ```
   `setup` is not idempotent (`CREATE TABLE` fails if tables already exist). If the DB is already current, skip this and wipe instead.
3. **Clean slate** (existing DB, same schema):
   ```bash
   npm run ephemeral:wipe       # truncate all tables except feature_flags; empty the ephemeral R2 bucket
   ```
4. **Stop the jamshot stack** if it is bound to `:5001` / `:5002`. Both modes share those ports.
5. **Start backend:**
   ```bash
   JAMSHOT_ENV=ephemeral npm run dev:backend
   # alias: npm run dev:ephemeral
   ```
   Confirm logs show `[dev-env] ephemeral: env/.env.dev → env/.env.ephemeral` (or `[dev-env] loaded env/.env.dev → env/.env.ephemeral`).
6. **Start UI** (separate terminal) if the test needs the browser:
   ```bash
   JAMSHOT_ENV=ephemeral npm run dev --workspace=ui
   ```
   VS Code/Cursor: **Next.js: debug full stack (ephemeral)**.
7. **Seed auth.** The jamshot spoof user is usually missing. Insert one, then send `x-dev-user-id` (see [api-work.mdc](../../../.cursor/rules/api-work.mdc)):

   ```sql
   INSERT INTO users (id, name, username, email, terms_accepted, privacy_policy_accepted)
   VALUES (
     'RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE',
     'Ephemeral Test',
     'eph_test',
     'eph-test@example.com',
     true,
     true
   )
   ON CONFLICT (id) DO NOTHING;
   ```

## Verify you are on ephemeral

- Process env: `DB_NAME=sterio-ephemeral`, `R2_BUCKET=sterio-ephemeral`, `JAMSHOT_ENV=ephemeral`.
- SQL against `sterio-ephemeral-db` (or `psql` using `DB_CONNECTION_STRING` from the overlay). Do **not** use `sterio-local-db`.
- A jamshot-only username (e.g. `sunhertzmusic`) returns 404 from this API.
- Service logs: MCP `get_local_logs` (`sterio-local-logs`).

## Commands

| Script | Effect |
|---|---|
| `npm run ephemeral:setup` | Create `sterio-ephemeral` if needed; apply `docs/database/schema/*.sql` |
| `npm run ephemeral:wipe` | Truncate all public tables except `feature_flags`; delete all objects in the ephemeral R2 bucket |
| `npm run ephemeral:teardown` | Drop database `sterio-ephemeral`. Does **not** delete `env/.env.ephemeral` |
| `npm run dev:ephemeral` | Backend with `JAMSHOT_ENV=ephemeral` |

Wipe and teardown refuse to run unless `JAMSHOT_ENV=ephemeral` and the database/bucket names contain `ephemeral`.

## After tests

```bash
npm run ephemeral:wipe
```

Switch back to jamshot by stopping the ephemeral backend and running `npm run dev:backend` (no `JAMSHOT_ENV`).
