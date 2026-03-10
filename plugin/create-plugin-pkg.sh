#!/bin/bash
set -e

PLUGIN_NAME="Sterio"
VERSION="0.1.0"
BUILD_DIR="build/SterioPlugin_artefacts/Release"
PKG_ROOT="pkgroot"
OUTPUT="Sterio-$VERSION.pkg"

echo "Creating pkg for $PLUGIN_NAME $VERSION"

# Clean
rm -rf $PKG_ROOT
mkdir -p $PKG_ROOT/Library/Audio/Plug-Ins/VST3
mkdir -p $PKG_ROOT/Library/Audio/Plug-Ins/Components
mkdir -p $PKG_ROOT/Applications

# Copy plugins from JUCE build artifacts
cp -R "$BUILD_DIR/VST3/$PLUGIN_NAME.vst3" $PKG_ROOT/Library/Audio/Plug-Ins/VST3/
cp -R "$BUILD_DIR/AU/$PLUGIN_NAME.component" $PKG_ROOT/Library/Audio/Plug-Ins/Components/

# Optional standalone app
if [ -d "$BUILD_DIR/Standalone/$PLUGIN_NAME.app" ]; then
    cp -R "$BUILD_DIR/Standalone/$PLUGIN_NAME.app" $PKG_ROOT/Applications/
fi

# Build installer
pkgbuild \
  --root $PKG_ROOT \
  --identifier fm.sterio.plugin \
  --version $VERSION \
  --install-location / \
  $OUTPUT

echo "Package created:"
echo "$OUTPUT"