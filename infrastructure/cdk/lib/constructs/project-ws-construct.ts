import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface ProjectWsConstructProps {
  stack: cdk.Stack;
}

export class ProjectWsConstruct extends Construct {
  public readonly testLambda: lambda.Function;
  public readonly prodLambda: lambda.Function;
  public readonly testWebSocketApi: apigatewayv2.WebSocketApi;
  public readonly prodWebSocketApi: apigatewayv2.WebSocketApi;

  constructor(scope: Construct, id: string, props: ProjectWsConstructProps) {
    super(scope, id);

    const { stack } = props;

    const testEnv = new ProjectWsEnvironment(this, 'Test', { stack, suffix: 'test' });
    const prodEnv = new ProjectWsEnvironment(this, 'Prod', { stack, suffix: 'prod' });

    this.testLambda = testEnv.lambda;
    this.prodLambda = prodEnv.lambda;
    this.testWebSocketApi = testEnv.webSocketApi;
    this.prodWebSocketApi = prodEnv.webSocketApi;

    new cdk.CfnOutput(stack, 'ProjectWsTestUrl', {
      value: testEnv.stage.url,
      description: 'Project WebSocket API URL (test)',
    });

    new cdk.CfnOutput(stack, 'ProjectWsProdUrl', {
      value: prodEnv.stage.url,
      description: 'Project WebSocket API URL (prod)',
    });
  }
}

interface ProjectWsEnvironmentProps {
  stack: cdk.Stack;
  suffix: 'test' | 'prod';
}

class ProjectWsEnvironment extends Construct {
  public readonly lambda: lambda.Function;
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly stage: apigatewayv2.WebSocketStage;

  constructor(scope: Construct, id: string, props: ProjectWsEnvironmentProps) {
    super(scope, id);

    const { stack, suffix } = props;
    const isTest = suffix === 'test';
    const functionName = isTest ? 'sterio-project-ws-test' : 'sterio-project-ws';
    const apiName = isTest ? 'sterio-project-ws-test' : 'sterio-project-ws';
    const stageName = isTest ? 'test' : 'prod';

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    const wsLambda = new lambda.Function(this, 'Lambda', {
      functionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Placeholder — code deployed by GitHub Actions');
          return { statusCode: 200, body: 'Placeholder' };
        };
      `),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    this.lambda = wsLambda;

    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName,
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          wsLambda
        ),
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          wsLambda
        ),
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          wsLambda
        ),
      },
    });

    this.stage = new apigatewayv2.WebSocketStage(this, 'Stage', {
      webSocketApi: this.webSocketApi,
      stageName,
      autoDeploy: true,
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${stack.region}:${stack.account}:${this.webSocketApi.apiId}/${stageName}/POST/@connections/*`,
        ],
      })
    );

    wsLambda.addPermission('AllowWebSocketInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${stack.region}:${stack.account}:${this.webSocketApi.apiId}/*`,
    });
  }
}
