---
name: jamshot-issues
description: Creates Jamshot markdown issues under app documentation/issues with valid frontmatter, next id, slug filename, subdirectory, area, tags, and priority. Use when the user asks to add or create an issue, backlog item, or ticket in the issues folder or issues-visualizer format.
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
| `id` | Integer; must be **max existing id + 1** after scanning every `**/*.md` under the root |
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
| `tree-page` | Track tree, feed, queue, player, search, comments, track component, plays/analytics UX |
| `auth` | Login, session, profile, Google OAuth, blocking users, subscriptions/billing UX |
| `competitions` | Competitions, entries, hosts, payouts, contest rules |
| `notifications` | In-app/email notifications, badges, mentions, notification settings |
| `camps-and-teams` | Camps, teams, shared spaces |
| *(root)* | Cross-cutting infra, navbar, content moderation, generic product, or multi-area items |

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

## Workflow

1. **Read** nothing mandatory except when needed: grep or glob `app documentation/issues/**/*.md` for `^id:` to compute **next id**.
2. **Title**: short summary; expand details in the body.
3. **Type**: infer from wording (`fix`, `broken`, `error` → `bug`; `refactor`, `migration`, `script cleanup` → `tech-debt`; else `feature`) unless the user specifies.
4. **Folder**, **area**, **tags**, **priority**: apply rules above; state the choices briefly when replying.
5. **Write** the file at `app documentation/issues/<folder?>/{id}-{slug}.md`.
6. **Double-check**: `type`/`status` valid; `priority` in range; body ends with newline.

## Template

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

- Folder `DAW`, `area: daw`, `type: bug`, `tags: [daw, ux]`, `priority: 5` (or **9–10** if the user calls it launch-blocking).
- File: `DAW/{next}-daw-undo-batching.md`
