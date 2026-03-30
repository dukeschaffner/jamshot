---
id: 107
title: Handle TLS/network failures when loading tracks (avoid retry storms)
type: bug
status: open
priority: 7
area: plugin
tags:
  - plugin
  - ux
  - security
---
On some corporate networks, TLS failures prevent loading tracks. The plugin currently retries loading in a tight loop, which is noisy and unhelpful.

Acceptance: detect non-recoverable TLS/certificate or network errors, surface a clear message, back off or stop after bounded retries, and avoid hammering the API.
