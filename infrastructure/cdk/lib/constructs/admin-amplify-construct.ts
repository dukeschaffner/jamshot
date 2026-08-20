import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as fs from 'fs';
import * as path from 'path';

export interface AdminAmplifyConstructProps {
  stack: cdk.Stack;
  githubOwner?: string;
  githubRepo?: string;
}

interface AdminAmplifyBranchConfig {
  id: string;
  branchName: string;
  stage: 'DEVELOPMENT' | 'PRODUCTION';
  ssmPrefix: string;
  contextKeys: {
    apiUrl: string;
    betterAuthUrl: string;
  };
}

const ADMIN_AMPLIFY_BRANCHES: AdminAmplifyBranchConfig[] = [
  {
    id: 'AdminTest',
    branchName: 'dev',
    stage: 'DEVELOPMENT',
    ssmPrefix: '/jamshot/admin/test',
    contextKeys: {
      apiUrl: 'adminTestApiUrl',
      betterAuthUrl: 'adminTestBetterAuthUrl',
    },
  },
  {
    id: 'AdminProd',
    branchName: 'main',
    stage: 'PRODUCTION',
    ssmPrefix: '/jamshot/admin/prod',
    contextKeys: {
      apiUrl: 'adminProdApiUrl',
      betterAuthUrl: 'adminProdBetterAuthUrl',
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

function loadAdminBuildSpec(): string {
  const buildSpecPath = path.resolve(__dirname, '../../../../admin/amplify.yml');
  return fs.readFileSync(buildSpecPath, 'utf8');
}

function branchEnvironmentVariables(
  scope: Construct,
  config: AdminAmplifyBranchConfig,
): amplify.CfnBranch.EnvironmentVariableProperty[] {
  return [
    { name: 'NODE_ENV', value: 'production' },
    {
      name: 'NEXT_PUBLIC_API_URL',
      value: getContextOrSsmSecure(
        scope,
        config.contextKeys.apiUrl,
        `${config.ssmPrefix}/api-url`,
      ),
    },
    {
      name: 'NEXT_PUBLIC_BETTER_AUTH_URL',
      value: getContextOrSsmSecure(
        scope,
        config.contextKeys.betterAuthUrl,
        `${config.ssmPrefix}/better-auth-url`,
      ),
    },
  ];
}

/**
 * Amplify Hosting app for Sterio Admin (outreach + future admin tools).
 * Custom domain admin.sterio.fm should be mapped in Amplify Console / DNS after deploy.
 */
export class AdminAmplifyConstruct extends Construct {
  public readonly adminApp: amplify.CfnApp;

  constructor(scope: Construct, id: string, props: AdminAmplifyConstructProps) {
    super(scope, id);

    const { stack } = props;
    const githubOwner = props.githubOwner ?? 'dukeschaffner';
    const githubRepo = props.githubRepo ?? 'jamshot';
    const githubAccessToken = getContextOrSsmSecure(
      this,
      'githubAccessToken',
      '/jamshot/github/amplify-access-token',
    );
    const buildSpec = loadAdminBuildSpec();

    const amplifyServiceRole = new iam.Role(this, 'AdminAmplifyServiceRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'Service role for Sterio Admin Amplify app',
    });

    amplifyServiceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify'),
    );

    const amplifyComputeRole = new iam.Role(this, 'AdminAmplifyComputeRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'SSR compute role for Sterio Admin Amplify app',
    });

    this.adminApp = new amplify.CfnApp(this, 'AdminApp', {
      name: 'sterio-admin',
      repository: `https://github.com/${githubOwner}/${githubRepo}`,
      accessToken: githubAccessToken,
      platform: 'WEB_COMPUTE',
      buildSpec,
      iamServiceRole: amplifyServiceRole.roleArn,
      computeRoleArn: amplifyComputeRole.roleArn,
      enableBranchAutoDeletion: false,
      environmentVariables: [{ name: 'NODE_ENV', value: 'production' }],
    });

    for (const config of ADMIN_AMPLIFY_BRANCHES) {
      const branch = new amplify.CfnBranch(this, `${config.id}Branch`, {
        appId: this.adminApp.attrAppId,
        branchName: config.branchName,
        enableAutoBuild: true,
        stage: config.stage,
        environmentVariables: branchEnvironmentVariables(this, config),
      });

      branch.addDependency(this.adminApp);
    }

    new cdk.CfnOutput(stack, 'AdminAmplifyAppId', {
      value: this.adminApp.attrAppId,
      description: 'Sterio Admin Amplify app ID (dev + main branches)',
    });

    new cdk.CfnOutput(stack, 'AdminAmplifyDefaultDomain', {
      value: this.adminApp.attrDefaultDomain,
      description: 'Sterio Admin Amplify default domain (map admin.sterio.fm in Amplify Console)',
    });
  }
}
