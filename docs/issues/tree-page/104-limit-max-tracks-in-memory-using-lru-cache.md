---
id: 104
title: Limit max tracks in memory using LRU cache
type: task
status: open
priority: 5
area: tree-page
tags:
  - track
  - performance
---
Cap how many tracks are held in memory at once using an LRU eviction policy so the track tree stays responsive on large graphs without unbounded memory growth.
