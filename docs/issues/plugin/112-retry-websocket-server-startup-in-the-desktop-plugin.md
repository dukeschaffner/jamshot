---
id: 112
title: Retry websocket server startup in the desktop plugin
type: task
status: open
priority: 5
area: plugin
tags:
  - plugin
  - infra
---
If the local websocket server fails to start (port in use, transient error), retry with backoff or surface a clear recoverable error instead of failing silently once.
