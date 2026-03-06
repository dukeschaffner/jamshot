import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface VideoExportConstructProps {
  stack: cdk.Stack;
}

export class VideoExportConstruct extends Construct {
  public readonly testLambda: lambda.Function;
  public readonly prodLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: VideoExportConstructProps) {
    super(scope, id);

    const { stack } = props;

    // IAM Role with necessary permissions for video export
    const videoExportRole = new iam.Role(this, 'VideoExportLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Add basic Lambda execution permissions
    videoExportRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Add permissions to access SSM Parameters
    videoExportRole.addToPolicy(new iam.PolicyStatement({
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
    videoExportRole.addToPolicy(new iam.PolicyStatement({
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

    // S3/R2 permissions for video uploads
    videoExportRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:GetObject',
        's3:DeleteObject'
      ],
      resources: [
        `arn:aws:s3:::sterio-videos/*`,
        `arn:aws:s3:::sterio-videos-test/*`
      ]
    }));

    // Video Export Lambda Functions (Test and Prod)
    // Code will be deployed by GitHub Actions
    // Using Python 3.11 runtime for video processing
    this.testLambda = new lambda.Function(this, 'VideoExportLambdaTest', {
      functionName: 'sterio-video-export-test',
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromInline(`
def handler(event, context):
    print('Test Video Export Lambda function deployed - code will be updated by GitHub Actions')
    return {
        'statusCode': 200,
        'body': 'Placeholder test function'
    }
      `),
      handler: 'index.handler',
      role: videoExportRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008, // Higher memory for video processing
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    this.prodLambda = new lambda.Function(this, 'VideoExportLambdaProd', {
      functionName: 'sterio-video-export',
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromInline(`
def handler(event, context):
    print('Prod Video Export Lambda function deployed - code will be updated by GitHub Actions')
    return {
        'statusCode': 200,
        'body': 'Placeholder prod function'
    }
      `),
      handler: 'index.handler',
      role: videoExportRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008, // Higher memory for video processing
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Output the lambda function names and ARNs
    new cdk.CfnOutput(stack, 'VideoExportLambdaTestName', {
      value: this.testLambda.functionName,
      description: 'Video Export Test Lambda Function Name',
    });

    new cdk.CfnOutput(stack, 'VideoExportLambdaTestArn', {
      value: this.testLambda.functionArn,
      description: 'Video Export Test Lambda Function ARN',
    });

    new cdk.CfnOutput(stack, 'VideoExportLambdaProdName', {
      value: this.prodLambda.functionName,
      description: 'Video Export Prod Lambda Function Name',
    });

    new cdk.CfnOutput(stack, 'VideoExportLambdaProdArn', {
      value: this.prodLambda.functionArn,
      description: 'Video Export Prod Lambda Function ARN',
    });
  }
}

