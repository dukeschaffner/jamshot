---
id: 122
title: web DAW enhancements
type: feature
status: open
priority: 7
area: daw
tags:
  - daw
---



- make user input latency compensation be stored/read per input device instead of globally
- add "set latency compensation from nudge value" button
    - if a user nudges a region on the recording track, show a subtle button that sets the latency compensation for the current input device to the nudge value delta
    - button could be a discrete seafoam circle on the region. it should be visible for 30s after the nudge is released. any region movements on that region that are > 100ms should hide the button
    - the first time the user ever nudges a recorded region, show a popover indicating what the button does (and maybe every 30 days after that just as a reminder, unless the user has clicked the button at least once)
    - the same popover should be shown on hover of the button
