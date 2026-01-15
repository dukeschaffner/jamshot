import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { LogRetention } from 'aws-cdk-lib/aws-logs';

export class JamshotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // IAM Role with necessary permissions
    const emailNotificationsRole = new iam.Role(this, 'EmailNotificationsLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Add basic Lambda execution permissions
    emailNotificationsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Add permissions to access SSM Parameters
    emailNotificationsRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath'
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/jamshot/*`
      ]
    }));

    // CloudWatch Logs permissions
    emailNotificationsRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`
      ]
    }));

    // Email Notifications Lambda Functions (Test and Prod)
    // Code will be deployed by GitHub Actions
    const emailNotificationsLambdaTest = new lambda.Function(this, 'EmailNotificationsLambdaTest', {
      functionName: 'sterio-email-notifications-test',
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Test Lambda function deployed - code will be updated by GitHub Actions');
          return { statusCode: 200, body: 'Placeholder test function' };
        };
      `),
      handler: 'index.handler',
      role: emailNotificationsRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const emailNotificationsLambdaProd = new lambda.Function(this, 'EmailNotificationsLambdaProd', {
      functionName: 'sterio-email-notifications',
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Prod Lambda function deployed - code will be updated by GitHub Actions');
          return { statusCode: 200, body: 'Placeholder prod function' };
        };
      `),
      handler: 'index.handler',
      role: emailNotificationsRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });


    // EventBridge Rule for daily execution (runs at 9 AM UTC every day)
    const dailyEmailRule = new events.Rule(this, 'DailyEmailNotificationsRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '9',
        day: '*',
        month: '*',
        year: '*'
      }),
      description: 'Trigger email notifications lambda daily at 9 AM UTC'
    });

    // Add the prod lambda as target for the EventBridge rule
    dailyEmailRule.addTarget(new targets.LambdaFunction(emailNotificationsLambdaProd));

    // Grant EventBridge permission to invoke the prod lambda
    emailNotificationsLambdaProd.addPermission('AllowEventBridgeInvocation', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: dailyEmailRule.ruleArn,
    });

    // Output the lambda function names and ARNs
    new cdk.CfnOutput(this, 'EmailNotificationsLambdaTestName', {
      value: emailNotificationsLambdaTest.functionName,
      description: 'Email Notifications Test Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'EmailNotificationsLambdaTestArn', {
      value: emailNotificationsLambdaTest.functionArn,
      description: 'Email Notifications Test Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'EmailNotificationsLambdaProdName', {
      value: emailNotificationsLambdaProd.functionName,
      description: 'Email Notifications Prod Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'EmailNotificationsLambdaProdArn', {
      value: emailNotificationsLambdaProd.functionArn,
      description: 'Email Notifications Prod Lambda Function ARN',
    });

    // Output the EventBridge rule name
    new cdk.CfnOutput(this, 'DailyEmailRuleName', {
      value: dailyEmailRule.ruleName,
      description: 'Daily Email Notifications EventBridge Rule Name',
    });

    // Adding log retention to existing Lambda functions not managed by CDK
    const existingLambdas = [
      'sterio-analytics-aggregator',
      'sterio-analytics-aggregator-test',
      'sterio-api',
      'sterio-api-test',
      'sterio-audio-processor',
      'sterio-audio-processor-test',
      'sterio-competition-processor-test',
      'sterio-analytics-cleanup',
      'sterio-analytics-cleanup-test'
    ];

    // Apply log retention to all existing Lambda functions
    existingLambdas.forEach(lambdaName => {
      new LogRetention(this, `LogRetention${lambdaName.replace(/-/g, '')}`, {
        logGroupName: `/aws/lambda/${lambdaName}`,
        retention: logs.RetentionDays.ONE_WEEK,
      });
    });
  }
}
