# Sterio Plugin

JUCE-based audio plugin for Sterio. Plays stems from liked tracks in sync with the host DAW transport.

## Requirements

- CMake 3.22+
- JUCE (in `~/Downloads/JUCE` by default)
- C++17 capable compiler (Xcode on macOS, MSVC on Windows, GCC/Clang on Linux)

## Build

```bash
cd plugin
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .
```

To use a different JUCE path:

```bash
cmake .. -DJUCE_PATH=/path/to/JUCE
```

## Output

- **macOS**: `Sterio_artefacts/Release/VST3/Sterio.vst3` and `Sterio_artefacts/Release/AU/Sterio.component`
- **Windows**: `Sterio_artefacts/Release/VST3/Sterio.vst3`
- **Linux**: `Sterio_artefacts/Release/VST3/Sterio.vst3`

## Increment 1 (Current)

- Plugin shell with pass-through audio
- Host transport sync: reads playhead position, isPlaying, BPM from the DAW
- Minimal editor showing transport status for testing

## Testing

1. Build the plugin
2. Copy the VST3 (or AU) to your system plugin folder, or load from the build output
3. Open a DAW (Reaper, Logic, etc.), add the plugin to a track
4. Start/stop transport — the editor should show "Playing"/"Stopped", time, and BPM
