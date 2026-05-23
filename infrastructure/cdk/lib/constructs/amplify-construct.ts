import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as fs from 'fs';
import * as path from 'path';

export interface AmplifyConstructProps {
  stack: cdk.Stack;
  githubOwner?: string;
  githubRepo?: string;
}

interface CmsAmplifyBranchConfig {
  id: string;
  branchName: string;
  stage: 'DEVELOPMENT' | 'PRODUCTION';
  ssmPrefix: string;
  contextKeys: {
    payloadSecret: string;
    databaseUrl: string;
    serverUrl: string;
  };
}

const CMS_AMPLIFY_BRANCHES: CmsAmplifyBranchConfig[] = [
  {
    id: 'CmsTest',
    branchName: 'dev',
    stage: 'DEVELOPMENT',
    ssmPrefix: '/jamshot/cms/test',
    contextKeys: {
      payloadSecret: 'cmsTestPayloadSecret',
      databaseUrl: 'cmsTestDatabaseUrl',
      serverUrl: 'cmsTestServerUrl',
    },
  },
  {
    id: 'CmsProd',
    branchName: 'main',
    stage: 'PRODUCTION',
    ssmPrefix: '/jamshot/cms/prod',
    contextKeys: {
      payloadSecret: 'cmsProdPayloadSecret',
      databaseUrl: 'cmsProdDatabaseUrl',
      serverUrl: 'cmsProdServerUrl',
    },
  },
];

function getContextOrSsmSecure(
  scope: Construct,
  contextKey: string,
  parameterName: string,
): string {
  const contextValue = scope.node.tryGetContext(contextKey);
  if (contextValue) {
    return contextValue;
  }

  return ssm.StringParameter.valueForSecureStringParameter(scope, parameterName, 1);
}

function loadCmsBuildSpec(): string {
  const buildSpecPath = path.resolve(__dirname, '../../../../cms/amplify.yml');
  return fs.readFileSync(buildSpecPath, 'utf8');
}

function branchEnvironmentVariables(
  scope: Construct,
  config: CmsAmplifyBranchConfig,
): amplify.CfnBranch.EnvironmentVariableProperty[] {
  return [
    { name: 'NODE_ENV', value: 'production' },
    {
      name: 'PAYLOAD_SECRET',
      value: getContextOrSsmSecure(
        scope,
        config.contextKeys.payloadSecret,
        `${config.ssmPrefix}/payload-secret`,
      ),
    },
    {
      name: 'CMS_DATABASE_URL',
      value: getContextOrSsmSecure(
        scope,
        config.contextKeys.databaseUrl,
        `${config.ssmPrefix}/database-url`,
      ),
    },
    {
      name: 'SERVER_URL',
      value: getContextOrSsmSecure(
        scope,
        config.contextKeys.serverUrl,
        `${config.ssmPrefix}/server-url`,
      ),
    },
  ];
}

export class AmplifyConstruct extends Construct {
  public readonly cmsApp: amplify.CfnApp;

  constructor(scope: Construct, id: string, props: AmplifyConstructProps) {
    super(scope, id);

    const { stack } = props;
    const githubOwner = props.githubOwner ?? 'dukeschaffner';
    const githubRepo = props.githubRepo ?? 'jamshot';
    const githubAccessToken = getContextOrSsmSecure(
      this,
      'githubAccessToken',
      '/jamshot/github/amplify-access-token',
    );
    const buildSpec = loadCmsBuildSpec();

    const amplifyServiceRole = new iam.Role(this, 'AmplifyServiceRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'Service role for Sterio CMS Amplify app',
    });

    amplifyServiceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify'),
    );

    const amplifyComputeRole = new iam.Role(this, 'AmplifyComputeRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'SSR compute role for Sterio CMS Amplify app',
    });

    // Keep CmsTestApp logical ID so CDK retains the existing Amplify app (d2hk8duup0wzus).
    this.cmsApp = new amplify.CfnApp(this, 'CmsTestApp', {
      name: 'sterio-cms',
      repository: `https://github.com/${githubOwner}/${githubRepo}`,
      accessToken: githubAccessToken,
      platform: 'WEB_COMPUTE',
      buildSpec,
      iamServiceRole: amplifyServiceRole.roleArn,
      computeRoleArn: amplifyComputeRole.roleArn,
      enableBranchAutoDeletion: false,
      environmentVariables: [{ name: 'NODE_ENV', value: 'production' }],
    });

    for (const config of CMS_AMPLIFY_BRANCHES) {
      const branch = new amplify.CfnBranch(this, `${config.id}Branch`, {
        appId: this.cmsApp.attrAppId,
        branchName: config.branchName,
        enableAutoBuild: true,
        stage: config.stage,
        environmentVariables: branchEnvironmentVariables(this, config),
      });

      branch.addDependency(this.cmsApp);
    }

    new cdk.CfnOutput(stack, 'CmsAmplifyAppId', {
      value: this.cmsApp.attrAppId,
      description: 'Sterio CMS Amplify app ID (dev + main branches)',
    });

    new cdk.CfnOutput(stack, 'CmsAmplifyDefaultDomain', {
      value: this.cmsApp.attrDefaultDomain,
      description: 'Sterio CMS Amplify default domain',
    });
  }
}
