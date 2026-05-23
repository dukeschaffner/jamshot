#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { JamshotAmplifyStack } from '../lib/jamshot-amplify-stack';
import { JamshotStack } from '../lib/jamshot-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-2',
};

// Existing lambda / log-retention infrastructure — deploy separately if needed.
new JamshotStack(app, 'JamshotStack', { env });

// CMS Amplify apps only — safe to deploy without touching JamshotStack resources.
new JamshotAmplifyStack(app, 'JamshotAmplifyStack', {
  env,
  description: 'Sterio CMS Amplify hosting (test + prod apps)',
});
