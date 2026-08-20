import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AmplifyConstruct } from './constructs/amplify-construct';
import { AdminAmplifyConstruct } from './constructs/admin-amplify-construct';

/**
 * Isolated stack for Amplify Hosting apps (CMS + Admin).
 * Deploy with: cdk deploy JamshotAmplifyStack
 */
export class JamshotAmplifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new AmplifyConstruct(this, 'Amplify', {
      stack: this,
    });

    new AdminAmplifyConstruct(this, 'AdminAmplify', {
      stack: this,
    });
  }
}
