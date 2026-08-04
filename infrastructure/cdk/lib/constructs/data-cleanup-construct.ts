import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface DataCleanupConstructProps {
  stack: cdk.Stack;
}

/**
 * Nightly data-cleanup Lambda (project asset cleanup + subscription retention).
 * Code is deployed by GitHub Actions; this construct creates the functions + schedule.
 */
export class DataCleanupConstruct extends Construct {
  public readonly testLambda: lambda.Function;
  public readonly prodLambda: lambda.Function;
  public readonly dailyRule: events.Rule;

  constructor(scope: Construct, id: string, props: DataCleanupConstructProps) {
    super(scope, id);

    const { stack } = props;

    const dataCleanupRole = new iam.Role(this, 'DataCleanupLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    dataCleanupRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    dataCleanupRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:ssm:${stack.region}:${stack.account}:parameter/jamshot/*`,
      ],
    }));

    dataCleanupRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
      ],
      resources: [
        `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/*`,
      ],
    }));

    this.testLambda = new lambda.Function(this, 'DataCleanupLambdaTest', {
      functionName: 'sterio-data-cleanup-test',
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Test data-cleanup placeholder — code updated by GitHub Actions');
          return { statusCode: 200, body: 'Placeholder test function' };
        };
      `),
      handler: 'dist/index.handler',
      role: dataCleanupRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    this.prodLambda = new lambda.Function(this, 'DataCleanupLambdaProd', {
      functionName: 'sterio-data-cleanup',
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Prod data-cleanup placeholder — code updated by GitHub Actions');
          return { statusCode: 200, body: 'Placeholder prod function' };
        };
      `),
      handler: 'dist/index.handler',
      role: dataCleanupRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Daily at 10:00 UTC (after email notifications at 09:00)
    this.dailyRule = new events.Rule(this, 'DailyDataCleanupRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '10',
        day: '*',
        month: '*',
        year: '*',
      }),
      description: 'Trigger data-cleanup lambda daily at 10 AM UTC',
    });

    this.dailyRule.addTarget(new targets.LambdaFunction(this.prodLambda, {
      event: events.RuleTargetInput.fromObject({}),
    }));

    this.prodLambda.addPermission('AllowEventBridgeInvocation', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: this.dailyRule.ruleArn,
    });

    new cdk.CfnOutput(stack, 'DataCleanupLambdaTestName', {
      value: this.testLambda.functionName,
      description: 'Data Cleanup Test Lambda Function Name',
    });

    new cdk.CfnOutput(stack, 'DataCleanupLambdaProdName', {
      value: this.prodLambda.functionName,
      description: 'Data Cleanup Prod Lambda Function Name',
    });

    new cdk.CfnOutput(stack, 'DataCleanupLambdaTestArn', {
      value: this.testLambda.functionArn,
      description: 'Data Cleanup Test Lambda Function ARN',
    });

    new cdk.CfnOutput(stack, 'DataCleanupLambdaProdArn', {
      value: this.prodLambda.functionArn,
      description: 'Data Cleanup Prod Lambda Function ARN',
    });
  }
}
