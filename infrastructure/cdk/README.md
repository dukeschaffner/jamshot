# Jamshot Infrastructure CDK

This CDK project defines the AWS infrastructure for the Jamshot application's email notifications lambda function.

## Architecture

The CDK stack creates:

1. **Email Notifications Lambda Function**
   - Node.js 18.x runtime
   - 15-minute timeout (for processing large batches of emails)
   - 1024MB memory allocation
   - Code and environment variables are set by GitHub Actions during deployment

2. **IAM Role**
   - Lambda execution permissions
   - SSM Parameter access permissions
   - CloudWatch Logs permissions

3. **EventBridge Rule**
   - Scheduled to run daily at 9 AM UTC
   - Triggers the email notifications lambda

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **CDK CLI installed** (`npm install -g aws-cdk`)
3. **Node.js 18+** installed
4. **SSM Parameters** created for configuration (see below)

## Required SSM Parameters

Before deploying, create these SSM parameters in your AWS account. These will be accessed by GitHub Actions to set environment variables for the Lambda function:

### Database Configuration
```
/jamshot/database/host - Database host (e.g., your-neon-db-host.neon.tech)
/jamshot/database/port - Database port (usually 5432)
/jamshot/database/name - Database name
/jamshot/database/user - Database username
/jamshot/database/password - Database password
```

### Email Configuration
```
/jamshot/email/smtp/host - SMTP server host
/jamshot/email/smtp/port - SMTP server port
/jamshot/email/smtp/secure - true/false for secure connection
/jamshot/email/smtp/user - SMTP username
/jamshot/email/smtp/password - SMTP password
```

### Application Configuration
```
/jamshot/frontend/url - Frontend application URL (e.g., https://sterio.fm)
```

### Optional Parameters
```
/jamshot/email/test_email - Test email address for development (optional)
```

## Deployment

1. **Install dependencies:**
   ```bash
   cd infrastructure/cdk
   npm install
   ```

2. **Bootstrap CDK (first time only):**
   ```bash
   cdk bootstrap
   ```

3. **Deploy the stack:**
   ```bash
   cdk deploy
   ```

4. **GitHub Actions Deployment:**
   After CDK deploys the infrastructure, GitHub Actions will:
   - Deploy the actual Lambda function code
   - Set environment variables
   - Update the Lambda function configuration

5. **View outputs:**
   The deployment will output the Lambda function name, ARN, and EventBridge rule name.

## Testing

Run the tests to verify the CDK template:

```bash
npm test
```

## Local Development

You can synthesize the CloudFormation template without deploying:

```bash
cdk synth
```

## Email Notifications Lambda

The lambda function:

- **Triggers**: Daily at 9 AM UTC via EventBridge
- **Function**: Sends activity summary emails to users based on their notification preferences
- **Data Source**: Queries `user_analytics_aggregates` table for user activity data
- **Email Types**:
  - Daily summaries (sent to users with `daily` preference)
  - Weekly summaries (sent Mondays to users with `weekly` preference)
  - Monthly summaries (sent on 1st of month to users with `monthly` preference)

## Environment Variables

The lambda uses the following environment variables, which are set by GitHub Actions during deployment (values loaded from SSM):

- `NODE_ENV`: Set to 'production'
- Database connection details (host, port, name, user, password)
- SMTP configuration for email sending
- Frontend URL for email links
- Optional test email for development

## Monitoring

- **CloudWatch Logs**: Lambda execution logs are retained for 1 week
- **CloudWatch Metrics**: Standard Lambda metrics are available
- **Error Handling**: Errors are logged but don't prevent other emails from being processed

## Cleanup

To destroy the infrastructure:

```bash
cdk destroy
```

**Warning**: This will delete all resources created by the stack, including the Lambda function and EventBridge rule.
