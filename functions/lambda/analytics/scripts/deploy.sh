#!/bin/bash

# Jamshot Analytics Lambda Deployment Script
# Usage: ./deploy.sh [stage] [region]

set -e

# Default values
STAGE=${1:-dev}
REGION=${2:-us-east-1}

echo "🚀 Deploying Jamshot Analytics Lambda"
echo "====================================="
echo "Stage: $STAGE"
echo "Region: $REGION"
echo ""

# Check if serverless is installed
if ! command -v serverless &> /dev/null; then
    echo "❌ Serverless Framework not found. Please install it:"
    echo "   npm install -g serverless"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run:"
    echo "   aws configure"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy .env.example to .env and configure it:"
    echo "   cp .env.example .env"
    echo "   # Edit .env with your database and AWS configuration"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy the function
echo "🚀 Deploying to AWS..."
serverless deploy --stage $STAGE --region $REGION

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "Functions deployed:"
echo "  - analyticsAggregator (timer-based)"
echo "  - analyticsManual (manual trigger)"
echo "  - analyticsCleanup (monthly cleanup)"
echo ""
echo "Next steps:"
echo "  1. Configure EventBridge rules in AWS Console"
echo "  2. Test the function manually"
echo "  3. Monitor CloudWatch logs"
echo ""
echo "Manual test command:"
echo "  aws lambda invoke --function-name jamshot-analytics-$STAGE-analyticsManual --payload '{\"period\":\"day\"}' response.json"
