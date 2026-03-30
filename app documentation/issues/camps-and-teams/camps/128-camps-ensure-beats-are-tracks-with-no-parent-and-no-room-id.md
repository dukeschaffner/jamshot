---
id: 128
title: 'Camps: ensure beats are tracks with no parent and no room_id'
type: tech-debt
status: open
priority: 5
area: camps-and-teams
tags:
  - camp
  - track
  - infra
---
Enforce / backfill that camp beats are represented as tracks that have no parent AND have no room_id.

Acceptance notes:
- Data invariant is defined and validated
- Existing data is migrated/backfilled
- Any queries rely on the invariant consistently
