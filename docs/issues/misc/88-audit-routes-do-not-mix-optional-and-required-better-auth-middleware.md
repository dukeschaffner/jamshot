---
id: 88
title: 'Audit routes: do not mix optional and required Better Auth middleware'
type: tech-debt
status: open
priority: 5
area: ''
tags:
  - auth
  - api
  - security
---
Ensure no route handlers use both `optionalBetterAuthMiddleware` and `betterAuthMiddleware`; pick one pattern per route so session handling is unambiguous.

Source: app documentation/optimizations.txt (API).
