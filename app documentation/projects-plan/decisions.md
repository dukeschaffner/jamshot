# Projects — Decisions (Resolved)

Source: [open-questions.md](./open-questions.md) · Updated with team/camp collaborator rule.

---

## Product scope

| Topic | Decision |
|---|---|
| Who can create | Everyone; limits per subscription tier |
| Member limit (personal) | Configurable per tier (`max_project_members`) |
| Member limit (team/camp) | `min(teamOrCampMemberCount, MAX_TEAM_CAMP_COLLABORATORS)` — default **25** |
| Team/camp relationship | Projects can belong to user subscription **or** team/camp context (`team_id` / `camp_id`); mutually exclusive |
| Publishing to feed | Post-MVP |
| Import from tracks | Yes — copy stem chain into project clips (no live link) |
| Mobile | Desktop-only for MVP |

---

## Phasing

| Phase | Scope |
|---|---|
| **1a** | Solo user: DB, REST, DAW, snapshots, plugin (Milestones 0–4, 5–11, 12–21, 22–25, 29–32) |
| **1b** | Import, team/camp projects, invites (Milestones 6 / Steps 26–28) |
| **2** | Real-time collaboration (Milestone 7) |
| **3** | Post-MVP polish |

**Phase 1a exit criteria:** create project → edit in browser → open in plugin → record in Logic → export WAV → drag back onto web timeline (Step 18).

**Phase 1b invites (pre-realtime):** either (a) invited users are **viewer-only** until Phase 2, or (b) defer Step 28 until after Milestone 7. **Default: (a)** with prominent warning for editors.

---

## Collaboration & sync

| Topic | Decision |
|---|---|
| Real-time stack | API Gateway WebSocket (Phase 2) |
| Realtime ephemeral state | **Neon (Postgres)** — WS connections + track locks |
| Offline editing | Online only |
| Locks | Track-level, auto-acquire on edit. Cross-track moves require both track locks |
| Lock timeout | Configurable TTL + heartbeat; 30–45s disconnect grace before release |
| REST during Phase 2 | Mutating REST routes enforce same locks as WS |
| Presence | Minimal for MVP ("X is editing…") |
| Max tracks | 20 (configurable) |
| Max duration | 300 seconds — fixed |
| Max collaborators (personal) | Tier-configurable (~10 default) |
| Max collaborators (team/camp) | `min(memberCount, 25)` |

---

## Audio & DAW

| Topic | Decision |
|---|---|
| Mixdown | Live Web Audio only — no `combined_audio_url` |
| Asset storage | `project_assets` table; clips reference `asset_id` |
| Audio URLs | **Public R2 URLs** via `storage_key` — no signed URLs |
| Clip upload | **Multipart to API** → temp R2 → **same audio-processing lambda** with project branch (format conversion only) |
| Clip created | On **upload POST success** (same transaction as `project_assets` insert) — not on lambda completion |
| Local playback while processing | **Yes** — reuse `bufferRegistry`; record stop places optimistic clip with local `AudioBuffer`; play from local until `completed`, then swap to server `audio_url` and release buffer |
| Processing failure | Lambda sets `failed` + `processing_error`; clip stays on timeline (no rollback); local buffer retained for retry via `clip_id` re-upload; no auto-retry |
| Takes | Single clip per record |
| Looper | Enabled; no loop-mode duration restrictions |
| Metronome / count-in / snap | Same as collab DAW |
| Empty tracks | Allowed |
| Track delete | Soft-delete clips; never hard-delete tracks with clip history |
| Clip overlap | Not allowed — server rejects |
| Files panel | Post-MVP |
| Auto-delete unused audio | Post-MVP — 7-day UI warning, 30-day grace |

---

## Snapshots

| Topic | Decision |
|---|---|
| Auto snapshots | Yes — **server-side** interval |
| Preview before restore | Yes — read-only audition |
| Restore | Canonical algorithm in [database.md](./database.md) — undelete clips, soft-delete extras |
| Snapshot kinds | `manual`, `auto`, `pre_restore` |
| Retention | Tier-based; prune oldest `auto` only |

---

## Plugin

| Topic | Decision |
|---|---|
| Auto-sync default | On |
| Auth | Same OAuth as today |
| Audio fetch | Public R2 URLs from `plugin-payload` |
| Playhead sync | None between DAW and web for MVP |
| Timeline view in plugin | Future phase |
| Last project | Stored locally in plugin |
| Message routing | Branch on `type` first (`set_track` vs `set_project`); use `project_sync` not `stem_metadata_sync` |

---

## Billing & UX

| Topic | Decision |
|---|---|
| Subscription config | `max_projects`, `max_project_members`, `max_snapshots` per tier + team plans + camp mapping |
| Upload quotas | Project clips do **not** count toward track quotas; still apply `uploadLimiter` / upload ban |
| Nav | "Projects" in desktop navbar |
| Terminology | Project |
| Privacy | Private, invite only (`is_private` retained for future public projects) |
| Non-member GET | 403 |

---

## Technical

| Topic | Decision |
|---|---|
| Revision conflicts | Silent rebase when clean; prompt when dirty |
| Feature flag | `projects` on UI **and** API |
| WS auth | JWT/session on `$connect`; authorize `join` via `projectAccess` |
| WS deploy | New CDK construct or workflow (not in current CDK stack) |
| DAW mode | `dawMode: 'collab' | 'original' | 'project'` + `armedTrackId` (replaces global `recording-track` in project mode) |
| Upload target track | **Any track** via drop, file picker, or per-track Import — arm state not required; `armedTrackId` is record-only. It will attempt to get lock on track before uploading. |
| ProjectEndOverlay | Reuse/adapt for project duration extension |

---

## Team/camp collaborator limit (detail)

When a project has `team_id` or `camp_id`:

```text
effectiveMaxMembers = min(countActiveTeamOrCampMembers(), MAX_TEAM_CAMP_COLLABORATORS)
```

Enforce at invite accept and member add (403 with clear message).

**Project creation:** verify team/camp membership and active subscription (mirror teams/camps validation).
