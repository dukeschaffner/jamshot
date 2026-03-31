---
id: 114
title: Auto-set DAW tempo and time signature via helpers/scripts
type: task
status: open
priority: 1
area: daw
tags:
  - daw
  - infra
  - ux
---
Goal:
Automatically set the DAW project tempo (BPM) and time signature from Jamshot track/session metadata when generating/importing DAW content.

MAYBE:
Use dedicated helpers/scripts so the DAW integration is consistent, less manual work for users, and fewer mismatches between Jamshot timing and the DAW session.

Acceptance notes:
- If tempo and time signature data are available, the script applies them to the generated DAW session/config.
- Provide a safe override path (e.g., do not overwrite when users explicitly set values).
- Document which DAW(s) are supported by the helper(s) and how to configure defaults.
