#!/bin/bash

# Create deployment package for Jamshot Competition Lambda
# This script creates a zip file ready for AWS Lambda deployment

cd /Users/dukeschaffner/Documents/CODING/apps/jamshot/functions/lambda/competitions
npm install
zip -r jamshot-competition-lambda.zip . \
  -x ".env" \
  -x "test/*" \
  -x "*.md" \
  -x "package-lock.json" \
  -x "scripts/*" \
  -x ".git/*" \
  -x "node_modules/.cache/*"
