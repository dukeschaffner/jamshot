# Projects — Plugin Integration

Extends existing Sterio plugin (`plugin/Source/`). Track-mode plugin already supports stem playback + local WebSocket server.

Parent: [overview.md](./overview.md) · Decisions: [decisions.md](./decisions.md)

**Auth:** same OAuth (`PluginState`, `SterioApiClient`).

**Audio URLs:** public R2 paths from API — **no signed URLs**. Plugin downloads from `${R2_PUBLIC_URL}/{storage_key}`.

---

## Current plugin (track mode)

| Piece | Role |
|---|---|
| `StemPlaybackEngine` | Stem playback synced to host DAW transport |
| `TrackLoader` | Fetches `/tracks/:id/stems` |
| `ConnectionManager` | Local WS server (port 59327) |
| `PluginProcessor.cpp` | `set_track`, `stem_metadata_sync` (requires `track_id` today) |

---

## Phase 1a — project playback + sync (Steps 29–32)

### PluginProcessor routing (prerequisite)

Restructure `handleIncomingMessage` to branch on **`type` first**:

```cpp
if (type == "set_track") { ... }      // existing; requires track_id
else if (type == "set_project") { ... }
else if (type == "project_sync") { ... }
```

Do **not** require `track_id` for project messages.

### `set_project`

Web → plugin:

```json
{
  "type": "set_project",
  "project_id": "123",
  "payload": {
    "bpm": 120,
    "timeSignature": "4/4",
    "durationSeconds": 120,
    "clips": [
      {
        "clipId": 10,
        "assetId": 42,
        "trackId": 1,
        "audioUrl": "https://...r2.../projects/1/42/audio.wav",
        "startTime": 0,
        "trimStart": 0,
        "trimEnd": 4.5,
        "gain": 0.8,
        "trackGain": 0.8
      }
    ]
  }
}
```

Plugin may fetch `GET /projects/:id/plugin-payload` instead of inline payload — either works; prefer fetch for large projects.

### `project_sync`

```json
{
  "type": "project_sync",
  "project_id": "123",
  "payload": { "clips": [ ... ] }
}
```

**Do not** use `stem_metadata_sync` merge logic — replace/update clips by `clipId`.

### Plugin work

1. `ProjectLoader` — fetch `plugin-payload`; download audio by public URL
2. Map clips → `StemPlaybackEngine` (see Clip mapping below)
3. Cache **audio files** by `(project_id, asset_id)` in `CacheManager` (see Audio cache below)
4. `PluginState.last_project_id` for reopen (Step 32)

### Audio cache

Multiple clips can share one asset. Cache **audio bytes** by asset, not by clip — same check-before-download pattern as track mode (`cacheManager.txt`).

| Layer | Key | Contents |
|---|---|---|
| Disk cache | `(project_id, asset_id)` | Raw/decoded WAV (mirrors R2 path `projects/{projectId}/{assetId}/audio.wav`) |
| Playback state | `clipId` | Pointer to cached asset buffer + trim/start/gain |
| Sync diff | `clipId` | Replace/update clip metadata on `project_sync` |

Flow:

1. On load/sync, collect distinct `assetId`s from clips
2. For each asset: if not cached, download from `audioUrl` and store; else reuse
3. Wire each clip to its asset buffer with clip-specific trim/placement

Invalidation: re-download only when a clip's `assetId` changes (re-record/retry). Trim, gain, and position changes update playback state only — no re-download.

Extend `CacheManager` with project asset methods (or a `ProjectCacheManager` wrapper) — do not duplicate the same WAV once per clip.

### Web work

- `ProjectPluginSync` on project toolbar: Open in Plugin, manual sync, auto-sync toggle, stale badge
- Extend `PluginWebSocketContext` message maps for `set_project` / `project_sync`
- Update `plugin/ws-message-schema.json`

### Auto-sync (default on)

Debounced `project_sync` after REST saves (Phase 1). After Phase 2: also after WS ops.

---

## Clip → StemPlaybackEngine mapping

Track stems:

```
{ track_id, audio_url, gain, order, regions: [{ start, end, offset }] }
```

Project clips:

```
{ clipId, assetId, audioUrl, startTime, trimStart, trimEnd, gain, trackGain }
```

Adapter:

- `order` = track sort order
- `regions` = `[{ start: clip.startTime, end: ..., offset: trimStart }]`
- Combined gain = clip gain × track gain

---

## Transport / playhead

**MVP:** plugin follows **host DAW** transport only. No web ↔ plugin playhead sync.

Step 29 "in sync with transport" means host DAW transport, not web playhead.

---

## Post-MVP — timeline view (Step 43)

`ProjectTimelineView` — read-only waveforms, host playhead. No editing in plugin.

---

## REST API

`GET /projects/:id/plugin-payload` — editors only; public R2 URLs.

`SterioApiClient` adds project fetch methods.

---

## Testing

- Extend `plugin/ws.js` for project messages
- Integration: web project page → `set_project` → audio in Logic/REAPER
- Cache: two clips sharing `assetId` → one download; clip `assetId` change on re-record → fetch new asset only

---

## Files to touch

```
plugin/Source/api/ProjectLoader.h/.cpp
plugin/Source/PluginProcessor.cpp      (type-first routing)
plugin/Source/PluginState.h/.cpp       (last_project_id)
plugin/Source/StemModels.h             (clip id identity)
plugin/ws-message-schema.json
ui/src/components/DAW/components/PluginSync.js  (or ProjectPluginSync.js)
ui/src/contexts/PluginWebSocketContext.js
```
