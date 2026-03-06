import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { LogRetention } from 'aws-cdk-lib/aws-logs';
import { EmailNotificationsConstruct } from './constructs/email-notifications-construct';
import { VideoExportConstruct } from './constructs/video-export-construct';

export class JamshotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Email Notifications Lambda Construct
    const emailNotifications = new EmailNotificationsConstruct(this, 'EmailNotifications', {
      stack: this,
    });

    // Video Export Lambda Construct
    const videoExport = new VideoExportConstruct(this, 'VideoExport', {
      stack: this,
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
