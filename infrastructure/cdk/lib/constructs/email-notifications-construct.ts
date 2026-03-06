import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface EmailNotificationsConstructProps {
  stack: cdk.Stack;
}

export class EmailNotificationsConstruct extends Construct {
  public readonly testLambda: lambda.Function;
  public readonly prodLambda: lambda.Function;
  public readonly dailyRule: events.Rule;

  constructor(scope: Construct, id: string, props: EmailNotificationsConstructProps) {
    super(scope, id);

    const { stack } = props;

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
        `arn:aws:ssm:${stack.region}:${stack.account}:parameter/jamshot/*`
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
        `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/*`
      ]
    }));

    // Email Notifications Lambda Functions (Test and Prod)
    // Code will be deployed by GitHub Actions
    this.testLambda = new lambda.Function(this, 'EmailNotificationsLambdaTest', {
      functionName: 'sterio-email-notifications-test',
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Test Lambda function deployed - code will be updated by GitHub Actions');
          return { statusCode: 200, body: 'Placeholder test function' };
        };
      `),
      handler: 'dist/index.handler',
      role: emailNotificationsRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    this.prodLambda = new lambda.Function(this, 'EmailNotificationsLambdaProd', {
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
    this.dailyRule = new events.Rule(this, 'DailyEmailNotificationsRule', {
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
    this.dailyRule.addTarget(new targets.LambdaFunction(this.prodLambda));

    // Grant EventBridge permission to invoke the prod lambda
    this.prodLambda.addPermission('AllowEventBridgeInvocation', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: this.dailyRule.ruleArn,
    });

    // Output the lambda function names and ARNs
    new cdk.CfnOutput(stack, 'EmailNotificationsLambdaTestName', {
      value: this.testLambda.functionName,
      description: 'Email Notifications Test Lambda Function Name',
    });

    new cdk.CfnOutput(stack, 'EmailNotificationsLambdaTestArn', {
      value: this.testLambda.functionArn,
      description: 'Email Notifications Test Lambda Function ARN',
    });

    new cdk.CfnOutput(stack, 'EmailNotificationsLambdaProdName', {
      value: this.prodLambda.functionName,
      description: 'Email Notifications Prod Lambda Function Name',
    });

    new cdk.CfnOutput(stack, 'EmailNotificationsLambdaProdArn', {
      value: this.prodLambda.functionArn,
      description: 'Email Notifications Prod Lambda Function ARN',
    });

    // Output the EventBridge rule name
    new cdk.CfnOutput(stack, 'DailyEmailRuleName', {
      value: this.dailyRule.ruleName,
      description: 'Daily Email Notifications EventBridge Rule Name',
    });

    // Override logical IDs to preserve existing resources
    // This prevents CDK from recreating resources that were already deployed
    // Main resources - these are the critical ones that must be preserved
    const roleCfn = emailNotificationsRole.node.defaultChild as cdk.CfnResource;
    const testLambdaCfn = this.testLambda.node.defaultChild as cdk.CfnResource;
    const prodLambdaCfn = this.prodLambda.node.defaultChild as cdk.CfnResource;
    const ruleCfn = this.dailyRule.node.defaultChild as cdk.CfnResource;
    
    if (roleCfn) roleCfn.overrideLogicalId('EmailNotificationsLambdaRole8D7598D7');
    if (testLambdaCfn) testLambdaCfn.overrideLogicalId('EmailNotificationsLambdaTest4EC6889A');
    if (prodLambdaCfn) prodLambdaCfn.overrideLogicalId('EmailNotificationsLambdaProd1CAAAA91');
    if (ruleCfn) ruleCfn.overrideLogicalId('DailyEmailNotificationsRuleEA3A719F');
  }
}

