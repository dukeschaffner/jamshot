---
id: 23
title: DAW loop region playhead offset
type: bug
status: open
priority: 5
area: ''
tags: []
---
  - short loop, region starts shortly after loop starts -> region is playing at loop start, not at region start
  
With a short loop, if the region starts shortly after the loop start, playback begins at the loop start instead of the region start. Region start and loop boundary should stay aligned with what is heard.
