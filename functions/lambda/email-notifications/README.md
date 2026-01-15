# Email Notifications Lambda Function

This Lambda function sends scheduled email notifications for activity summaries.

## Setup

1. Install dependencies:
```bash
cd functions/lambda/email-notifications
npm install
```

2. Set environment variables:
- `DB_HOST` - Database host
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `SMTP_HOST` - SMTP server host
- `SMTP_PORT` - SMTP server port
- `SMTP_SECURE` - Whether to use SSL (true/false)
- `EMAIL` - SMTP username
- `EMAIL_PASSWORD` - SMTP password
- `FRONTEND_URL` - Frontend URL for links (e.g., https://sterio.fm)
- `NODE_ENV` - Environment (production/development/test)
- `TEST_EMAIL` - Email to redirect to in dev/test environments

## Deployment

1. Package the function:
```bash
zip -r email-notifications.zip . -x "*.git*" "README.md" "*.DS_Store*"
```

2. Deploy to AWS Lambda with the following configuration:
- Runtime: Node.js 18.x or later
- Handler: index.handler
- Timeout: 15 minutes (for large user bases)
- Memory: 512 MB

3. Set up EventBridge trigger:
- Schedule: `cron(0 9 * * ? *)` (daily at 9 AM UTC)
- Target: This Lambda function

## Schedule Logic

- **Daily**: Runs every day
- **Weekly**: Runs on Mondays (sends weekly summaries)
- **Monthly**: Runs on the 1st of each month (sends monthly summaries)

## Local Development

Run the function locally for testing:

```bash
# Run based on current date schedule
node index.js

# Force specific period types
node index.js daily              # Send daily summaries only
node index.js weekly             # Send weekly summaries only
node index.js monthly            # Send monthly summaries only
node index.js daily weekly       # Send both daily and weekly

# Using npm script
npm start                        # Same as: node index.js
```

The function will:
- Connect to your local/dev database
- Process users based on their notification preferences
- Send emails to TEST_EMAIL if set in environment
- Log detailed information about processing

## Monitoring

The function logs:
- Number of users processed for each period type
- Number of emails sent successfully
- Number of errors encountered
- Processing time and batch information
- Date ranges being processed

Check CloudWatch logs for monitoring and debugging in production.
# Email notifications lambda for sending scheduled activity summary emails
