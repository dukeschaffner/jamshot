

goal - add audit trail to projects. the goal is that on the project page, I can open a view with an infinite scroll that shows the activity that shows the activity from oldest to newest or newest to oldest.
secondary goal would be to lay the foundation for an undo/redo system (although this is not a requirement if it's too much work or changes the design too infavorably)

specs:
- track each change to a project, including but not limited to:
    - region ops (create, move, trip, loop, delete, etc)
    - track ops (create, delete, rename, gain changes)
    - metadata ops (metronome change, time signature change, etc)
- for projects owned by a free tier user, the audit trail gets erased after 7 days



