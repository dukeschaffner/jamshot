---
id: 125
title: Migrate camp/team IDs to GUIDs
type: tech-debt
status: open
priority: 5
area: camps-and-teams
tags:
  - infra
  - api
  - camp
  - team
---
Plan and execute a migration from integer/legacy camp/team IDs to GUIDs across the system (API, DB, routing, and client).

Acceptance notes:
- New GUID fields are introduced and backfilled
- External APIs and routes accept GUIDs (with compatibility plan if needed)
- All references updated and verified
