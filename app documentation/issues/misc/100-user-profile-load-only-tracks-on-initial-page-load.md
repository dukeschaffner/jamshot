---
id: 100
title: 'User profile: load only tracks on initial page load'
type: tech-debt
status: open
priority: 5
area: tree-page
tags:
  - profile
  - performance
  - ux
---
The user page currently loads tracks, likes, and reposts on load; defer likes and reposts until needed and only load tracks at page load.

Source: app documentation/optimizations.txt (USER).
