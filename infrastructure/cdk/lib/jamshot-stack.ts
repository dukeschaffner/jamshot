import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { LogRetention } from 'aws-cdk-lib/aws-logs';
import { EmailNotificationsConstruct } from './constructs/email-notifications-construct';
import { DataCleanupConstruct } from './constructs/data-cleanup-construct';
import { ProjectAssetEventsConstruct } from './constructs/project-asset-events-construct';
import { ProjectWsConstruct } from './constructs/project-ws-construct';
import { VideoExportConstruct } from './constructs/video-export-construct';

export class JamshotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Email Notifications Lambda Construct
    const emailNotifications = new EmailNotificationsConstruct(this, 'EmailNotifications', {
      stack: this,
    });

    // Nightly data cleanup (asset cleanup + project retention)
    new DataCleanupConstruct(this, 'DataCleanup', {
      stack: this,
    });

    // Video Export Lambda Construct
    const videoExport = new VideoExportConstruct(this, 'VideoExport', {
      stack: this,
    });

    // Project WebSocket API + Lambda (realtime sync)
    new ProjectWsConstruct(this, 'ProjectWs', {
      stack: this,
    });

    // project_asset_created → existing audio-processing Lambdas (test + prod buses)
    new ProjectAssetEventsConstruct(this, 'ProjectAssetEvents', {
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
      'sterio-analytics-cleanup-test',
      'sterio-project-ws',
      'sterio-project-ws-test',
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
