---
id: 113
title: Fix web-to-plugin communication until page refresh on first plugin start
type: bug
status: open
priority: 5
area: plugin
tags:
  - plugin
  - ux
---
When the plugin starts for the first time, communication from the web app to the plugin does not work until the user refreshes the page. Startup/handshake or bridge initialization should work on first load without a manual refresh.
