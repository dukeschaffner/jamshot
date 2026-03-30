---
id: 83
title: Aggregate engagement counters on a timer
type: tech-debt
status: open
priority: 6
area: scalabity
tags:
  - analytics
  - api
  - infra
  - performance
  - track
---
Replace per-request updates on the play endpoint with a scheduled/timer job that rolls up track plays, likes, reposts, comments, and collab-related aggregates in batch. Reduces write load and hot paths at scale; define idempotency, lag tolerance, and how real-time UI reads cached vs eventual counts.
