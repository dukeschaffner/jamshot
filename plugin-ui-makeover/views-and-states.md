# Sterio Plugin — Views & States

Functional inventory of every user-facing view and state in the plugin editor. No theme, color, typography, or visual styling guidance.

Use this as the source of truth for layout structure and interactive states when rebuilding the UI.

---

## 1. App shell

Single resizable editor window. Always present when the plugin UI is open.

### Persistent chrome (always in the shell)

| Region | Contents |
|---|---|
| Top chrome | Help toggle; Update Available (conditional); Debug console entry (debug builds only) |
| Brand | Logo / product mark |
| Auth strip | Login / logout control and status |
| Message banner | Optional dismissible status/error banner |
| Body | Main content **or** Help (mutually exclusive) |
| Footer | Context for the currently selected track or project |

### Shell layout order (top → bottom)

1. Top chrome actions
2. Brand
3. Auth strip
4. Sample-rate warning (conditional)
5. Message banner (conditional)
6. Body (main content or help)
7. Footer

### Window constraints

- Default size roughly mid-small plugin panel
- Resizable within min/max bounds suitable for a DAW plugin editor

---

## 2. Top chrome

### Help toggle

- Always available
- Labels: **Help** when main content is showing; **Back** when Help is showing
- Action: swaps body between Main Content and Help View

### Update Available

- Visible only when a newer plugin version is available
- Action: opens the plugin download / update page in the system browser
- Hidden when no update is available

### Debug console entry (debug builds only)

- Button to open Debug Console modal
- Not present in release builds

### Sample-rate warning

- Visible when host sample rate is greater than 100 kHz
- Copy: warning that rates above 100 kHz are not supported and stems will not be converted
- No dismiss control; appears/disappears with host sample rate

---

## 3. Auth strip (`LoginView`)

Always present in the shell. No in-plugin credential form — login happens in the system browser via OAuth / web auth flow.

### States

| State | UI | Actions |
|---|---|---|
| Logged out | Primary control: **Log in to Sterio** | Starts browser auth + local callback |
| Loading user info | Status: **Loading user info…**; logout available once session exists | — |
| Logged in | Status: **Logged in as {username}**; control: **Log out** | Logout clears session and main content |
| User info failed | Status: **Failed to load user info**; logout available | Retry may occur on next open / refresh path |

### Side effects of auth change

- Login → main content shows tabs and lists
- Logout → main content returns to logged-out empty state; track/project selection cleared

---

## 4. Body — Main content vs Help

Body shows exactly one of:

- **Main content** (default)
- **Help view** (when Help is toggled on)

Auth strip, brand, footer, and top chrome remain visible in both cases.

---

## 5. Main content — logged out

### When

User is not logged in.

### UI

- Centered message: **Log in to view liked tracks and projects**
- Tabs, track list, project list, and project detail are hidden

---

## 6. Main content — logged in (tab shell)

### When

User is logged in and Help is not showing.

### Structure

```
Main content
├── Tab bar: Tracks | Projects
├── Tracks tab → Track list
└── Projects tab
    ├── List subview → Project list
    └── Detail subview → Project detail (timeline)
```

### Tab behavior

- **Tracks** — shows track list
- **Projects** — always lands on the **list** subview and clears any project detail selection when the Projects tab is activated
- Active tab is indicated (selected vs unselected)

---

## 7. Tracks tab — Track list

### Chrome

- Section title: **Liked Tracks**
- **Refresh** control — reloads liked tracks for the current user

### List row (per track)

- Title
- Secondary line: username · BPM · time signature
- Selection indicator when this track is the current selection
- Click / select → sets current track (loads stems for playback sync)

### Pagination

- When more pages exist: a **Load More** row / control at the end of the list

### Remote sync

- External “Open in Plugin” / WebSocket track selection can select a track by id without the user clicking the row

### Track list states

| State | Condition | UI |
|---|---|---|
| Not loaded | No data yet / cleared | Status: **No tracks loaded** or **No liked tracks**; list hidden |
| Loading | Fetch in progress | Status: **Loading tracks…**; list hidden |
| Error | API failure | Status: **Failed to load tracks**; optional message banner |
| Empty | Success, zero tracks | Status: **No liked tracks**; list hidden |
| Populated | One or more tracks | Scrollable list; status hidden while list is visible |

---

## 8. Projects tab — Project list

### When

Logged in + Projects tab + list subview.

### Chrome

- Section title: **Projects**
- **Refresh** control
- Auto-refresh when entering the Projects list (e.g. tab switch / login while on list)

### List row (per project)

- Name
- Secondary line: role · BPM · time signature
- Click → select project and navigate to Project detail

### Project list states

| State | Condition | UI |
|---|---|---|
| Not loaded | No data yet / cleared | Status: **No projects** / **No projects loaded**; list hidden |
| Loading | Fetch in progress | Status: **Loading projects…**; list hidden |
| Error | API failure | Status: **Failed to load projects**; optional message banner |
| Empty | Success, zero projects | Status: **No projects**; list hidden |
| Populated | One or more projects | Scrollable list |

---

## 9. Projects tab — Project detail

### When

Logged in + Projects tab + detail subview.

### Entry paths

- User clicks a project in the list
- Remote WebSocket / “open project in plugin” loads a project and opens detail
- Editor reopen while a project is already loaded in plugin state

### Chrome

- **Back** — compact control overlaid on the detail body (no dedicated header row); returns to project list (clears detail selection)
- Project name, BPM, and time signature are shown in the footer (not duplicated in detail chrome)

### Body states

| State | Condition | UI |
|---|---|---|
| Loading | Project / audio assets loading | Status: **Loading project…** or **Loading audio (n of m)…**; timeline hidden |
| Empty | Loaded but no playable stems/clips | Status: **No playable clips in this project** |
| Ready | Stems or clips present | Timeline visible |

---

## 10. Project timeline (ready detail)

### Structure

- Scrollable multi-lane timeline
- One lane per project track
- Clip blocks on lanes (with waveform representation when available)
- Loop / tiled clip regions as needed
- Playhead overlay synced to the host DAW transport (display-only)

### Per-lane controls

- **M** — mute toggle for that track
- **S** — solo toggle for that track

### Explicitly not in this view

- Click-to-seek
- Zoom controls
- Clip editing / trimming / moving
- Record / arm / bounce controls
- Dedicated transport play/stop controls (host-driven)

---

## 11. Footer

Always at the bottom of the shell. Content depends on selection / load progress.

| State | Condition | Content |
|---|---|---|
| Prompt | No track, no project, no active fetch progress | Guidance: select a track from the list, or use **Open in Plugin** from the Sterio web app |
| Asset fetch | Project (or related) audio fetch progress is active | **Fetching audio assets (n of m)** or **Fetching audio assets…** |
| Track selected | A liked track is current | Track title; artist; BPM and time signature |
| Project selected | A project is current and no track is current | **Project: {name}**; BPM and time signature |

---

## 12. Help view

### When

Help toggle is on (body replaces main content).

### Content (read-only, scrollable)

Instructions covering:

- Prefer 44.1 kHz host/project sample rate
- How to log in, or open a track via web **Open in Plugin**
- Sync metronome / time signature in the DAW; start playback from timeline start so the plugin can sync
- After recording in the DAW: bounce/export as WAV, then import/upload in the Sterio web DAW
- Syncing web DAW edits back via web **Sync edits to plugin**

No interactive controls beyond scrolling.

---

## 13. Message banner

### When

A user-facing info / warning / error / critical message is queued.

### UI

- Message text
- **OK** — dismisses and hides the banner

### Typical sources

- Track or project load failures
- Stem / audio load errors
- WebSocket / connection failures
- Other operational errors surfaced to the user

Not a toast; lives inline in the shell above the body.

---

## 14. Modals & system dialogs

### Debug console (debug builds only)

- Opened from debug chrome button
- Title: **Debug Console**
- Scrollable live log of internal messages with severity prefixes
- Dismissible (close / Escape)
- Resizable dialog window

### Plugin error alert

- Native system alert for serious plugin errors
- Title: **Plugin Error**
- Message body + **OK**

No settings dialog, no toast system, no context menus / callouts in the current product surface.

---

## 15. Cross-cutting state matrix

| Condition | Effect |
|---|---|
| Not logged in | Auth CTA; body = login prompt; tabs/lists hidden |
| Logged in | Tabs + Tracks/Projects content; username in auth strip |
| Help on | Body = Help; Help button label = Back |
| Update available | Update Available control visible |
| Sample rate > 100 kHz | Sample-rate warning visible |
| Message queued | Message banner visible |
| Track selected | Footer shows track meta; track row selected |
| Project loading | Footer and/or detail show fetch progress |
| Project ready with clips | Timeline + mute/solo |
| Project ready empty | Empty-clips status in detail |
| Remote set track | Selects track (typically on Tracks flow) |
| Remote set project | Switches to Projects detail for that project |
| Switch to Projects tab | Clear detail; show list |
| Debug build | Debug console available |

---

## 16. Navigation map

```
Editor open
│
├─ [Help] ──────────────────────────────► Help view
│                                         [Back] → Main content
│
└─ Main content
   ├─ Logged out → Login prompt
   └─ Logged in
      ├─ Tracks tab → Track list
      │                 └─ Select track → Footer + stem load
      └─ Projects tab
         ├─ List → Project list
         │           └─ Select project → Detail
         └─ Detail → Back → List
                     └─ Ready → Timeline (mute/solo)
```

External (browser / WebSocket) can also:

- Complete login → logged-in main content
- `Open in Plugin` / set track → select track
- Set / open project → Projects detail

---

## 17. Out of scope for this plugin surface

These are intentionally absent from the plugin UI (handled by host DAW and/or Sterio web app):

- Settings / preferences screen
- In-plugin recording, arm, or bounce UI
- Account management beyond login / logout / username
- Transport play/stop/BPM controls as editable UI
- Multi-page wizards or project creation flows
- Sidebar / hamburger navigation beyond the Tracks | Projects tabs

---

## 18. Artifact checklist (for unthemed HTML next)

Represent each of the following as distinct screens or overlays in the HTML artifact:

1. Shell chrome (logged out, no messages, no warnings)
2. Logged out — main login prompt
3. Logged in — Tracks tab, loading
4. Logged in — Tracks tab, empty
5. Logged in — Tracks tab, error
6. Logged in — Tracks tab, populated (with selection + Load More)
7. Logged in — Projects list, loading / empty / error / populated
8. Project detail — loading
9. Project detail — empty clips
10. Project detail — ready timeline (mute/solo, playhead)
11. Help view
12. Message banner (on top of a populated state)
13. Sample-rate warning (on top of a populated state)
14. Update Available visible
15. Footer variants: prompt / fetching / track / project
16. Debug console modal (optional; debug only)
17. Auth strip variants: logged out / loading / logged in / failed

Wire simple controls so tabs, Help/Back, project list→detail→Back, dismiss banner, and mute/solo can be exercised without any visual design system.
