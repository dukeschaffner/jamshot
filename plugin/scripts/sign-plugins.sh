#!/bin/bash
codesign --deep --force --options runtime --verify --verbose \
  --sign "Developer ID Application: JOHN WAYNE SCHAFFNER (ZK6F2S828L)" \
  ./build/SterioPlugin_artefacts/Release/VST3/Sterio.vst3

codesign --deep --force --options runtime --verify --verbose \
  --sign "Developer ID Application: JOHN WAYNE SCHAFFNER (ZK6F2S828L)" \
  ./build/SterioPlugin_artefacts/Release/AU/Sterio.component

codesign --deep --force --options runtime --verify --verbose \
  --sign "Developer ID Application: JOHN WAYNE SCHAFFNER (ZK6F2S828L)" \
  ./build/SterioPlugin_artefacts/Release/Standalone/Sterio.app

# verify and check the signature
#   codesign --verify --verbose=4 ./build/SterioPlugin_artefacts/Release/VST3/Sterio.vst3
# spctl -a -t exec -vv ./build/SterioPlugin_artefacts/Release/VST3/Sterio.vst3