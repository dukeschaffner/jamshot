# Tracktion Engine Test

A simple JUCE application using Tracktion Engine as a headless DAW backend with a minimal GUI for play/pause control.

## Prerequisites

- **CMake** 3.15 or higher
- **C++ Compiler** with C++20 support (Clang on macOS, GCC/MSVC on other platforms)
- **Git** for cloning dependencies

### macOS Additional Requirements
- Xcode Command Line Tools: `xcode-select --install`

## Setup

### 1. Clone Tracktion Engine (with JUCE submodule)

```bash
cd /Users/dukeschaffner/Documents/CODING/apps/jamshot/tracktion-test
git clone --recurse-submodules https://github.com/Tracktion/tracktion_engine.git
```

This will clone Tracktion Engine along with JUCE as a submodule.

### 2. Build the Project

```bash
# Create build directory
mkdir build
cd build

# Configure with CMake
cmake ..

# Build
cmake --build . --config Release
```

### 3. Run the Application

On macOS, the built app will be in:
```bash
./TracktionTest_artefacts/Release/TracktionTest.app/Contents/MacOS/TracktionTest
```

Or double-click the `.app` bundle in Finder.

## Project Structure

```
tracktion-test/
├── CMakeLists.txt          # Build configuration
├── README.md               # This file
├── test.mp3                # Audio file to play
├── src/
│   └── Main.cpp            # Application source code
├── tracktion_engine/       # Cloned dependency (git submodule)
│   └── modules/
│       └── juce/           # JUCE framework
└── build/                  # Build output (created by cmake)
```

## Features

- Play/Pause control for audio playback
- Time display (current position / total duration)
- Uses Tracktion Engine for audio processing
- Minimal JUCE GUI

## Troubleshooting

### "Audio file not found"
Make sure `test.mp3` is in the `tracktion-test` directory.

### Build errors about missing modules
Ensure you cloned with `--recurse-submodules`. If not, run:
```bash
cd tracktion_engine
git submodule update --init --recursive
```

### macOS signing issues
For development, you may need to allow the app in System Preferences > Security & Privacy.

