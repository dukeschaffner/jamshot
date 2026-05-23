import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AmplifyConstruct } from './constructs/amplify-construct';

/**
 * Isolated stack for CMS Amplify apps only.
 * Deploy with: cdk deploy JamshotAmplifyStack
 */
export class JamshotAmplifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new AmplifyConstruct(this, 'Amplify', {
      stack: this,
    });
  }
}
