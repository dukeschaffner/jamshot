import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AdminAmplifyConstruct } from './constructs/admin-amplify-construct';

/**
 * Isolated stack for Amplify Hosting apps (Admin).
 * Deploy with: cdk deploy JamshotAmplifyStack
 */
export class JamshotAmplifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new AdminAmplifyConstruct(this, 'AdminAmplify', {
      stack: this,
    });
  }
}
