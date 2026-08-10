---
id: 126
title: 'Camps: verify timestamps and timezone handling'
type: bug
status: open
priority: 5
area: camps-and-teams
tags:
  - camp
  - ux
---
Audit camp timestamps (start/end and any displayed times) to ensure timezone handling is correct and consistent.

Acceptance notes:
- Stored timestamps are unambiguous (UTC)
- UI displays expected local times
- No off-by-one-day issues around DST/timezones
