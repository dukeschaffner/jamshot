---
id: 141
title: stream and loop listening improvements
type: feature
status: open
priority: 6
area: tree-page
tags: []
---
- maybe an indicator in the graph if there's a new track in a given subtree
- notification or sound on moderation page when new track detected
- websocket based toast stream overlay (new page /stream-overlay which has ws connection and receives new track upload messages and displays them as toasts - capture this in OBS and overlay on stream)
- add boundary track id or created at to window fetch to prevent loading the same tracks again
- ability to record multiple # of loops (1-4?)

