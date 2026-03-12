#pragma once

#include <juce_core/juce_core.h>
#include <juce_audio_formats/juce_audio_formats.h>

//==============================================================================
/** Represents a region within a stem track */
struct StemRegion
{
    double offset = 0.0;    // Offset in seconds
    double startTime = 0.0; // Start time in seconds
    double endTime = 0.0;   // End time in seconds
};

//==============================================================================
/** Represents a stem track with audio buffer and region data */
struct StemTrack
{
    int trackId = 0;                    // Track ID
    juce::String audioUrl;              // CDN URL for the audio file
    float gain = 1.0f;                  // Gain multiplier (0.0 to 1.0)
    int order = 0;                      // Playback order
    std::shared_ptr<juce::AudioBuffer<float>> audioBuffer; // Decoded audio data (shared to avoid duplication)
    juce::Array<StemRegion> regions;    // Time regions for this stem

    bool operator== (const StemTrack& other) const
    {
        return trackId == other.trackId;
    }
};