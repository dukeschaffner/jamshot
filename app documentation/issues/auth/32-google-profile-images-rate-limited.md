---
id: 32
title: Google profile images rate limited
type: bug
status: open
priority: 5
area: ''
tags: []
---
Google sign-in flow hits HTTP 429 when loading profile pictures. Add backoff, batching, caching, or alternative avatar sourcing so sign-in and profile UI stay stable.
