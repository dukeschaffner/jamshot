#!/bin/bash

# Test Build Script for Video Export Lambda
# This script follows the same build process as the CI/CD pipeline

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Building Video Export Lambda package (test build)..."
echo "Working directory: $SCRIPT_DIR"

# Check Python version
echo "🐍 Checking Python version..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "Found Python $PYTHON_VERSION"

# Clean up previous build artifacts
echo "🧹 Cleaning up previous build artifacts..."
rm -rf package/
rm -f video-export-lambda.zip

# Upgrade pip
echo "⬆️  Upgrading pip..."
python3 -m pip install --upgrade pip --quiet

# Install dependencies to package directory
echo "📦 Installing dependencies to package/ directory..."
python3 -m pip install -r requirements.txt -t package/ --quiet

# Copy source code to package directory
echo "📋 Copying source code to package directory..."
cp handler.py package/
cp -r utils package/
if [ -d "assets" ]; then
    cp -r assets package/
    echo "  ✓ Copied assets directory"
else
    echo "  ⚠️  Assets directory not found (skipping)"
fi

# Create deployment package
echo "📦 Creating deployment package (video-export-lambda.zip)..."
cd package
zip -r ../video-export-lambda.zip . \
    -x "*.pyc" \
    -x "__pycache__/*" \
    -x "*.py[cod]" \
    -x "*\$py.class" \
    -x "*.dist-info/*" \
    -x "*.egg-info/*" \
    -q

cd ..

# Get package size
PACKAGE_SIZE=$(du -h video-export-lambda.zip | cut -f1)
echo "✅ Build complete!"
echo ""
echo "📊 Package details:"
echo "   File: video-export-lambda.zip"
echo "   Size: $PACKAGE_SIZE"
echo "   Location: $SCRIPT_DIR/video-export-lambda.zip"
echo ""
echo "💡 You can now test this package locally or upload it to AWS Lambda for testing."

