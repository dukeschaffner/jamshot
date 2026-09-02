- `ui/next.config.mjs` `images.remotePatterns` still includes `127.0.0.1` `/cdn-cgi/local/r2/public/**` (leftover Wrangler local R2 emulator). Ephemeral mode uses a real R2 public hostname that is not in that list.
- Issues live in `docs/issues/`, but `issues-visualizer/server/index.mjs` and `.cursor/skills/jamshot-issues/SKILL.md` still point at `app documentation/issues` (that directory does not exist).

