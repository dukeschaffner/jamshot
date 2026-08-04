import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface ProjectAssetEventsConstructProps {
  stack: cdk.Stack;
}

/**
 * Route project asset uploads to the existing audio-processing Lambdas.
 * Event buses and audio Lambdas are owned outside this stack; we import them.
 */
export class ProjectAssetEventsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ProjectAssetEventsConstructProps) {
    super(scope, id);

    const { stack } = props;

    new ProjectAssetEventRoute(this, 'Test', {
      stack,
      busName: 'sterio-test-events',
      ruleName: 'sterio-project-asset-created-test',
      audioFunctionName: 'sterio-audio-processor-test',
      description:
        'Route project asset creation events to audio processing lambda (test)',
    });

    new ProjectAssetEventRoute(this, 'Prod', {
      stack,
      busName: 'sterio-prod-events',
      ruleName: 'sterio-project-asset-created',
      audioFunctionName: 'sterio-audio-processor',
      description:
        'Route project asset creation events to audio processing lambda (prod)',
    });
  }
}

interface ProjectAssetEventRouteProps {
  stack: cdk.Stack;
  busName: string;
  ruleName: string;
  audioFunctionName: string;
  description: string;
}

class ProjectAssetEventRoute extends Construct {
  constructor(scope: Construct, id: string, props: ProjectAssetEventRouteProps) {
    super(scope, id);

    const { busName, ruleName, audioFunctionName, description } = props;

    const bus = events.EventBus.fromEventBusName(this, 'Bus', busName);
    const audioFn = lambda.Function.fromFunctionName(
      this,
      'AudioProcessor',
      audioFunctionName
    );

    const rule = new events.Rule(this, 'Rule', {
      ruleName,
      eventBus: bus,
      description,
      eventPattern: {
        source: ['sterio.projects'],
        detailType: ['project_asset_created'],
      },
    });

    rule.addTarget(new targets.LambdaFunction(audioFn));
  }
}
