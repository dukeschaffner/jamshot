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

# Use virtual environment Python if it exists, otherwise use system Python
if [ -d "venv" ] && [ -f "venv/bin/python" ]; then
    echo "🔧 Using virtual environment Python..."
    PYTHON_CMD=venv/bin/python
else
    PYTHON_CMD=python3
fi

# Clean up previous build artifacts
echo "🧹 Cleaning up previous build artifacts..."
rm -rf package/
rm -f video-export-lambda.zip

# Upgrade pip
echo "⬆️  Upgrading pip..."
$PYTHON_CMD -m pip install --upgrade pip --quiet

# Install dependencies to package directory
echo "📦 Installing dependencies to package/ directory..."
$PYTHON_CMD -m pip install -r requirements.txt -t package/ --quiet

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

# Clean up unnecessary files before packaging
echo "🧹 Removing unnecessary files to reduce package size..."
cd package

# Remove documentation and test files
find . -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "doc" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "example" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.md" -delete 2>/dev/null || true
find . -type f -name "*.txt" -not -path "*/site-packages/*" -delete 2>/dev/null || true
find . -type f -name "*.rst" -delete 2>/dev/null || true
find . -type f -name "LICENSE*" -delete 2>/dev/null || true
find . -type f -name "COPYING*" -delete 2>/dev/null || true
find . -type f -name "CHANGELOG*" -delete 2>/dev/null || true
find . -type f -name "README*" -delete 2>/dev/null || true

# Remove platform-specific binaries (keep only Linux x86_64)
# imageio_ffmpeg contains binaries for multiple platforms
if [ -d "imageio_ffmpeg" ]; then
    echo "  🗑️  Removing non-Linux binaries from imageio_ffmpeg..."
    find imageio_ffmpeg -type f \( -name "*.dylib" -o -name "*.dll" -o -name "*darwin*" -o -name "*win*" -o -name "*macos*" \) -delete 2>/dev/null || true
    # Keep only Linux x86_64 binaries
    find imageio_ffmpeg -type f -name "*.so" ! -path "*linux*x86_64*" -delete 2>/dev/null || true
fi

# Remove numpy tests and unnecessary files
if [ -d "numpy" ]; then
    echo "  🗑️  Cleaning up numpy..."
    find numpy -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
    find numpy -type d -name "doc" -exec rm -rf {} + 2>/dev/null || true
    find numpy -type f -name "*.pyx" -delete 2>/dev/null || true
    find numpy -type f -name "*.pxd" -delete 2>/dev/null || true
    find numpy -type f -name "*.pxi" -delete 2>/dev/null || true
fi

# Remove botocore docs and examples
if [ -d "botocore" ]; then
    echo "  🗑️  Cleaning up botocore..."
    find botocore -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
    find botocore -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true
    find botocore/data -type f ! -name "*.json" -delete 2>/dev/null || true
fi

# Remove boto3 examples
if [ -d "boto3" ]; then
    echo "  🗑️  Cleaning up boto3..."
    find boto3 -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true
    find boto3 -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
fi

# Remove PIL/Pillow tests
if [ -d "PIL" ]; then
    echo "  🗑️  Cleaning up PIL..."
    find PIL -type d -name "Tests" -exec rm -rf {} + 2>/dev/null || true
fi

# Remove moviepy tests and examples
if [ -d "moviepy" ]; then
    echo "  🗑️  Cleaning up moviepy..."
    find moviepy -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
    find moviepy -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true
fi

# Remove imageio tests
if [ -d "imageio" ]; then
    echo "  🗑️  Cleaning up imageio..."
    find imageio -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
fi

# Remove psycopg2 tests
if [ -d "psycopg2" ]; then
    echo "  🗑️  Cleaning up psycopg2..."
    find psycopg2 -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
fi

# Remove dist-info and egg-info directories (metadata only)
find . -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

cd ..

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

