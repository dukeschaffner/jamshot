#!/bin/bash
codesign --deep --force --verify --verbose \
  --sign "Developer ID Certification Authority" \
  ./build/SterioPlugin_artefacts/Release/VST3/Sterio.vst3

# verify and check the signature
#   codesign --verify --verbose=4 ./build/SterioPlugin_artefacts/Release/VST3/Sterio.vst3
# spctl -a -t exec -vv ./build/SterioPlugin_artefacts/Release/VST3/Sterio.vst3