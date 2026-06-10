The purpose of this file is to keep a record of assumptions, decisions, or any other important details that are learned as coding agents implement the project feature. This file will be referenced by future coding agents that are working on the feature to help get them up to speed.

---

## Progress (Milestone 0)

| Step | Status | Notes |
|------|--------|-------|
| 1 — Project config constants | **Done (code)** | |
| 2 — Subscription tier limits | **Done (code)** | |
| 3 — Feature flag | **Done (code)** | DB seed written; apply manually |
| 4 — Database migration | **Done (DDL)** | Apply `api/db-updates.txt` on dev DB |
| 5 — Project access utilities | **Done (code)** | `projectAccess.js`, `projectUtils.js` |
| 6+ | Not started | |

---

## Shared config & limits (`@sterio/subscription-utils`)

**Do not use `copy-shared-folder.py`** — it was removed. API and UI both import from the workspace package:

```js
import { MAX_PROJECT_TRACKS, getProjectLimits } from '@sterio/subscription-utils';
```

| File | Purpose |
|------|---------|
| `packages/subscription-utils/src/projectConfig.js` | Global non-tier constants (duration, track cap, lock TTL, asset grace, etc.) |
| `packages/subscription-utils/src/projectLimits.js` | `getProjectLimits`, `getEffectiveMaxMembers`, `getCampProjectLimits` |
| `packages/subscription-utils/src/index.js` | Re-exports constants + helpers |

### Tier limits (as implemented)

All personal tiers (free/basic/premium) currently share the same project limits from the plan example:

- `max_projects: 1`
- `max_project_members: 10`
- `max_snapshots: 10`

All team plans: `max_projects: 1`, `max_snapshots: 10` (enterprise: `-1` for both).

Track count is **not** per-tier — use `MAX_PROJECT_TRACKS` from `projectConfig.js`.

### `getProjectLimits(context)` usage

```js
// Personal
getProjectLimits({ type: 'personal', user })

// Team / camp (camp uses same product_version keys as TEAM_PLANS)
getProjectLimits({ type: 'team', productVersion: '25_users', memberCount: 30 })
// → effective_max_members: min(30, MAX_TEAM_CAMP_COLLABORATORS) = 25
```

Step 5 should wire `getProjectLimitsForContext(project, user)` in API utils — can delegate to `getProjectLimits` with the right context shape.

### Project counting (not yet enforced — Step 6)

- Personal: `owner_id = $userId AND team_id IS NULL AND camp_id IS NULL`
- Team: `team_id = $teamId`
- Camp: `camp_id = $campId`

**Gap:** Step 2 notes say deleted projects should not count toward `max_projects`, but Step 4 schema has **no `projects.deleted_at`**. Either add column later or hard-delete with cascade. Do not enforce counting until this is resolved.

---

## Feature flag (`projects`)

| Item | Detail |
|------|--------|
| DB seed | `api/db-updates.txt` (INSERT, default `false`) + `api/migrations/history/projects-feature-flag.txt` |
| Enable locally | `UPDATE feature_flags SET flag_value = true WHERE flag_key = 'projects';` |
| Admin UI | **None** — same as other flags; toggle via SQL |
| API behavior | **404** when off (not 403 like analytics/subscriptions) — see `requireProjectsFeature` |
| UI behavior | Nav links hidden when off; `/projects` calls `notFound()` |

### Files

- `api/lambda/src/middleware/projectsFeatureMiddleware.js` — `requireProjectsFeature`
- `api/lambda/src/routes/projects.js` — stub `GET /` → `{ projects: [] }`; all routes use middleware
- `api/lambda/src/express-api.js` — mounted at `/api/projects`
- `ui/src/components/Navbar.js` — desktop "Projects" link (authenticated + flag on)
- `ui/src/components/MoreDropdown.js` — mobile/desktop more menu link
- `ui/src/app/(frontend)/projects/page.js` — placeholder list page

Flag cache TTL is 5 minutes (`api/lambda/src/utils/featureFlags.js`) — restart lambda or wait after DB toggle.

---

## Database (Step 4)

DDL lives in `api/db-updates.txt` under **Migration: Projects schema (2026-06-10)**. Canonical reference copy in `app documentation/db-schema.txt` (bottom).

### Tables created

`projects`, `project_members`, `project_tracks`, `project_assets`, `project_clips`, `project_snapshots`, `project_snapshot_assets`, `project_invites`

### Not in this migration (later steps)

- `project_ws_connections`, `project_track_locks` — **Step 33** (Phase 2 realtime)
- No FK to social `tracks` — import is copy-only

### Implementation choices

- Migration uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for safer re-runs
- Triggers use `DROP TRIGGER IF EXISTS` before create (idempotent)
- `project_clips.project_track_id` and `asset_id` are `ON DELETE RESTRICT` — never hard-delete tracks with clip history (see `database.md` restore algorithm)
- `project_invites.expires_at` defaults to 7 days in DB; app constant `INVITE_DEFAULT_EXPIRY_DAYS` should stay in sync

### Verify after apply

```sql
\d projects
\d project_clips
```

---

## Conventions for next steps

1. **All new `/api/projects/*` routes** — apply `requireProjectsFeature` (already on router via `router.use` in `projects.js`; keep it there).
2. **Access checks** — non-members get **403** on `GET /projects/:id` (do not leak existence via 404); see `api.md`.
3. **Audio URLs** — public R2 paths from `storage_key`; no signed URLs for project assets.
4. **Clip uploads** — skip social upload quotas; still use `uploadLimiter` / upload ban checks.
5. **Revision** — mutating routes will require `revision` (Step 7+); plan for conflict handling in `projectUtils.js`.

---

## Step 5 — Access & serialization utils

| File | Exports |
|------|---------|
| `api/lambda/src/utils/projectAccess.js` | `checkProjectAccess`, `getProjectLimitsForContext`, `canAddMember`, `hasMinimumProjectRole`, `ROLE_RANK` |
| `api/lambda/src/utils/projectUtils.js` | `serializeProjectState`, `getProjectAssetPublicUrl`, `collectSnapshotAssetIds` |

### `checkProjectAccess(projectId, userId)`

- Joins `projects` + `project_members`; returns `{ hasAccess, role, project }` or `{ hasAccess: false, status: 403 }`.
- Unknown project **and** non-member both return **403** (no existence leak).
- Unauthenticated → **401**.

### `getProjectLimitsForContext(project, user)`

Delegates to `getProjectLimits` from `@sterio/subscription-utils`:

- Personal: `{ type: 'personal', user }`
- Team/camp: queries `product_version` + member count, then `{ type: 'team'|'camp', productVersion, memberCount }`

### `canAddMember(project, user, currentMemberCount, teamOrCampSize?)`

- Compares `currentMemberCount` to `limits.effective_max_members`.
- Optional `teamOrCampSize` avoids re-querying team/camp size when caller already has it.
- Returns `{ allowed: true }` or `{ allowed: false, reason: 'Project member limit reached (N/M)' }`.

### `serializeProjectState(projectId, { variant })`

| `variant` | Use case | Shape |
|-----------|----------|-------|
| `'rest'` (default) | `GET /projects/:id` | Project metadata + nested tracks/clips; public R2 URLs on completed clips; `processingStatus` on clips |
| `'snapshot'` | `project_snapshots.state` | Timeline only; clips reference `assetId` (no URLs) |
| `'plugin'` | `GET .../plugin-payload` | Flat `clips[]` with completed audio only |

Audio URLs: `${R2_PUBLIC_URL}/${storage_key}` via `getProjectAssetPublicUrl`. Soft-deleted clips excluded.

### Manual verify (after migration + seed data)

```js
import { checkProjectAccess } from './src/utils/projectAccess.js';
// owner → { hasAccess: true, role: 'owner' }
// non-member → { hasAccess: false, status: 403 }
```

---

## Changelog

| Date | Step | Summary |
|------|------|---------|
| 2026-06-10 | 1–4 | Foundation: shared constants/limits, feature flag + gated UI stub, full Phase 1a schema DDL |
| 2026-06-10 | 5 | Project access checks + canonical state serializer |
