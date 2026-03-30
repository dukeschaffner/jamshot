---
name: jamshot-issues
description: Creates Jamshot markdown issues under app documentation/issues — prefer POST to issues-visualizer create API; if unreachable, write the file locally with scanned next id. Use when the user asks to add or create an issue, backlog item, or ticket in the issues folder or issues-visualizer format.
---

# Jamshot issue files

## Root and format

- **Root**: `app documentation/issues` (same as `issues-visualizer/server/index.mjs` → `ISSUES_ROOT`).
- **Filename**: `{nextId}-{slug}.md` where `slug` = slugify(title), max **80** characters.
- **Slugify**: lowercase → replace runs of non `[a-z0-9]` with `-` → trim `-` from ends → slice(0, 80) → if empty use `issue`.
- **Body**: YAML frontmatter (gray-matter style) then markdown body; end body with a newline.

## Frontmatter (required)

| Field | Allowed / notes |
|-------|------------------|
| `id` | Integer; **assigned by the server** on `POST /api/issues`; on **fallback** (API down), **max existing id + 1** after scanning `**/*.md` |
| `title` | Short summary title (drives filename; avoid relying on truncation) |
| `type` | Exactly one of: `bug`, `feature`, `tech-debt` |
| `status` | Default `open`. Others: `in-progress`, `blocked`, `done` |
| `priority` | Integer **1–10** (see heuristics below) |
| `area` | Single string; see **Area** below |
| `tags` | YAML array of short lowercase kebab tags; see **Tags** |

**Do not** invent other frontmatter keys; the visualizer normalizes `id`, `title`, `type`, `status`, `priority`, `area`, `tags` only.

## Subdirectory (relative path under root)

Pick **one** folder from the table. If nothing fits, use **root** (no subfolder).

| Folder | Use when |
|--------|----------|
| `DAW` | Collab DAW, recording, loops, takes, layers, count-in, stems in editor |
| `plugin` | Desktop/plugin, upload processing time, audio pipeline, Soundtrap import, transport sync |
| `tree-page` | Track tree |
| `auth` | Login, session, profile, Google OAuth, blocking users, subscriptions/billing UX |
| `competitions` | Competitions, entries, hosts, payouts, contest rules |
| `notifications` | In-app/email notifications, badges, mentions, notification settings |
| `camps-and-teams` | applies to both camps and teams |
| `camps-and-teams/camps` | applies to only camps |
| `camps-and-teams/teams` | applies to only teams |
| `misc` | Cross-cutting infra, navbar, content moderation, generic product, or multi-area items |
You may also examine the existing folders to see if there are any new ones. You can use new ones too.

Nested path = only the folder name as a segment (e.g. `DAW/84-my-title.md`), not deeper paths unless the repo already uses them.

## Area field

Set `area` from the **folder** for consistency and filtering:

- `DAW` → `daw`
- `plugin` → `plugin`
- `tree-page` → `tree-page`
- `auth` → `auth`
- `competitions` → `competitions`
- `notifications` → `notifications`
- `camps-and-teams` → `camps-and-teams`
- Root file → `area: ''` (empty string)

If the user explicitly names an area, use their value (still a single string).

## Tags

Choose **0–5** tags from this pool; add only what fits the title/body. Prefer specificity over volume.

`daw`, `plugin`, `audio`, `feed`, `player`, `search`, `track`, `auth`, `oauth`, `profile`, `billing`, `competition`, `notification`, `camp`, `team`, `infra`, `api`, `analytics`, `moderation`, `ads`, `mobile`, `stripe`, `upload`, `processing`, `ux`, `performance`, `security`

**Optional signals**

- `tech-debt` or `bug` or `feature` as a tag **only if** it adds search value beyond `type` (usually skip—`type` already encodes this).
- Include `competition` when folder is `competitions` or copy is entry/host/rules.

If nothing applies, `tags: []`.

## Priority (**10** = highest, **1** = lowest)

Use **one** band; default **5** when unsure.

| Priority | When |
|----------|------|
| **10** | Severest: data loss, active exploit, production outage, or non-negotiable pre-launch blocker |
| **8–9** | Launch-adjacent bugs, broken core flows, serious UX dead-ends |
| **6–7** | Important but not emergency; most “should fix soon” work |
| **5** | Normal default for new issues |
| **3–4** | Polish, nice-to-haves, non-blocking bugs |
| **1–2** | Icebox / “after beta” / exploratory backlog (repo has used **2** for large post-beta batches—use **1–2** when the user says backlog, after beta, or roadmap) |

If the user states priority, map it into **1–10** (remembering **10** is most urgent) and use it.

## Create via API (preferred)

Handler: `issues-visualizer/server/index.mjs` → `POST /api/issues`. Same tree as **`app documentation/issues`**. Default base URL **`http://localhost:3050`**; port from env **`ISSUES_API_PORT`** on the server if overridden.

**Request**

- Method: **POST**
- URL: `http://localhost:{PORT}/api/issues`
- Header: **`Content-Type: application/json`**
- Body (JSON object) — **do not send `id`**; the server sets `id` to `maxIssueIdFromDisk() + 1` and builds `{id}-{slugify(title)}.md`.

| JSON field | Type / notes |
|------------|----------------|
| `directory` | String; subfolder under issues root, POSIX style, **no** leading/trailing slashes. Use `""` for root. Examples: `DAW`, `competitions`. |
| `title` | String; required, non-empty (after trim). |
| `type` | One of: `bug`, `feature`, `tech-debt`. |
| `status` | One of: `open`, `in-progress`, `blocked`, `done` (default **`open`** for new issues). |
| `priority` | Number **1–10**. |
| `area` | String; use `""` for root issues per **Area field** above. |
| `tags` | JSON array of strings (can be `[]`). |
| `content` | String; markdown body **after** the frontmatter (no YAML in this field). Server ensures trailing newline. |

**Success**: HTTP **201**, body `{ "relativePath": "DAW/85-example.md" }` (path uses `/`).

**Errors**: non-2xx JSON may include `{ "error": "..." }` (e.g. validation). **409** if the target file already exists.

**Example** (`curl`):

```bash
curl -sS -X POST "http://localhost:3050/api/issues" \
  -H "Content-Type: application/json" \
  -d '{
    "directory": "DAW",
    "title": "Example issue title",
    "type": "feature",
    "status": "open",
    "priority": 5,
    "area": "daw",
    "tags": ["daw", "ux"],
    "content": "Body paragraph(s) go here.\n"
  }'
```

## Fallback (API unreachable)

If **POST** fails (connection refused, timeout, DNS, or you cannot get **201** with a usable `relativePath`): tell the user the **issues-visualizer API does not appear to be running or reachable** (start the server from `issues-visualizer` if they want API-backed creation). Then **create the file yourself**:

1. Compute **next id**: grep or glob `app documentation/issues/**/*.md` for `^id:`; `maxId = 0`, for each numeric id `n` use `maxId = Math.max(maxId, n)`; **next id** = `maxId + 1` (or **1** if none).
2. **Write** `app documentation/issues/<folder?>/{nextId}-{slug}.md` using the **Template** below (include `id` in frontmatter).

Optional: `GET http://localhost:{PORT}/api/health` returns `{ ok: true }` when the server process is up (still use **POST** to create).

## Workflow

1. **Decide** title, type, status, priority, folder (`directory`), area, tags, and markdown **content** (body only).
2. **Try** **Create via API** with a properly formatted **POST** body.
3. **On 201**: confirm `relativePath` to the user; no manual file write.
4. **On failure**: follow **Fallback**; keep the user-facing API message in your reply.
5. **Double-check**: `type`/`status` valid; `priority` in range; body ends with newline (API adds newline to `content` if missing).

## Template (fallback manual file only)

For **POST**, put the prose in JSON `content` and the other fields in the JSON body — **omit `id`**.

For **fallback**, write this file shape:

```markdown
---
id: N
title: Short summary title
type: feature
status: open
priority: 5
area: ''
tags: []
---
One or more paragraphs describing the issue, acceptance notes, or links.

```

Use `area: tree-page` (etc.) when inside a subfolder per the Area rules.

## Example

**Input**: “DAW undo sometimes batches weirdly”

- Folder `DAW`, `area: daw`, `type: bug`, `tags: ["daw", "ux"]`, `priority: 5` (or **9–10** if the user calls it launch-blocking).
- **POST** with `"directory": "DAW"`, `"title": "…"`, `"content": "…"` (etc.); server writes `DAW/{id}-daw-undo-batching.md`.
- **Fallback**: same fields in frontmatter + body file path `DAW/{nextId}-daw-undo-batching.md`.
