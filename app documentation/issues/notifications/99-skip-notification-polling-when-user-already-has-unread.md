---
id: 99
title: Skip notification polling when user already has unread
type: tech-debt
status: open
priority: 5
area: notifications
tags:
  - notification
  - performance
---
Avoid polling for new notifications when the client already knows there are unread notifications (reduce redundant requests).

Source: app documentation/optimizations.txt (NOTIFICATIONS).
