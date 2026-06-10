---
name: api-work
description: Describes best practices when working on the api
---


# API Development Best Practices

## Testing Changes

After making changes to the API - especially new routes - run the API and hit the endpoints and examine the logs and responses to make sure everything is working as expected. Also use the postgres mcp server to examine the database and make sure the changes are reflected in the database correctly.

For testing API endpoints with auth, use header `x-dev-user-id` with value `RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE` to spoof the user id.