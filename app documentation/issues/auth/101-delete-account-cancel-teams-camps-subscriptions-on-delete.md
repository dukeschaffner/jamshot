---
id: 101
title: 'Delete account: cancel teams/camps subscriptions on delete'
type: task
status: open
priority: 6
area: auth
tags:
  - auth
  - team
  - camp
  - billing
---
ensure that when a user deletes their account, any active teams/camps subscriptions are cancelled as part of the flow so billing does not continue after the account is gone.

**Acceptance notes**
- Deletion flow cancels or ends subscription obligations tied to teams/camps for that user where applicable.
- Behaviour is consistent with product/legal requirements for subscription handling on account closure.
