


## Individual plans

| Feature                   |      Free | Basic ($4.99) | Premium ($12.99) |
| ------------------------- | --------: | ------------: | ---------------: |
| Owned projects            |         2 |            10 |               50 |
| Max collaborators/project |         5 |            10 |               25 |
| Storage/project           |      1 GB |         10 GB |            50 GB |
| Live collaboration        |         ✓ |             ✓ |                ✓ |
| Version history           |    None   |       yes     |        yes       |
| File export               |    None   |       yes     |        yes       |



## Camps/Teams

Storage per project: 30 GB
Collaborators/project: min(25, team/camp size)
File export: yes
Version history: yes

### Teams

| Team size | Projects | 
| --------- | -------: | 
| 5         |       20 |
| 10        |       50 | 
| 25        |      150 |  
| 50        |      400 | 
| 100       |     1000 |

### Camps


| Camp      | Projects |
| --------- | -------: | 
| 10 users  |       50 | 
| 25 users  |      150 |
| 50 users  |      300 |
| 100 users |      600 | 



## General

users can participate in unlimited projects - only ownership of projects is limited.



if subscription expires or is cancelled, project access should be revoked. a month after subscription expires, all projects should be deleted (if camp or team subscription) or all projects above the free limit (oldest first) should be deleted (if individual subscription). subscription owners should be notified via email 1 week before deletion and 1 day before deletion.

make sure to handle edge cases like chanding subscription plans. users shouldnt be able to game the system by changing subscription plans to get more, then downgrading and retaining projects that were created with the higher plan for example.

NOTE: file export and version history are not yet implemented. just add them to the plans for now.
