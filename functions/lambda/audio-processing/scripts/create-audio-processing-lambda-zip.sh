#!/bin/bash

# Script to create deployment zip for Jamshot Audio Processing Lambda
# This script should be run from the functions/lambda/audio-processing directory

set -e

echo "🎵 Creating Jamshot Audio Processing Lambda deployment package..."

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "index.js" ]; then
    echo "❌ Error: Must be run from the audio-processing lambda directory"
    exit 1
fi

# Clean up any existing zip
rm -f jamshot-audio-processing-lambda.zip

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Create the zip file
echo "📁 Creating deployment zip..."
zip -r jamshot-audio-processing-lambda.zip . \
    -x "*.git*" \
    -x "*test*" \
    -x "*.md" \
    -x "scripts/*" \
    -x "*.zip"

echo "✅ Deployment package created: jamshot-audio-processing-lambda.zip"
echo "📊 Package size:"
du -h jamshot-audio-processing-lambda.zip
