#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>
#include <memory>
#include <vector>

//==============================================================================
/** Shared timeline clip visual used by project + track plugin timelines. */
struct TimelineClipVisual
{
    int clipId = 0;
    double startTime = 0.0;
    double endTime = 0.0;
    double loopEnd = 0.0; // > endTime means looped; 0 or <= endTime = no loop
    double trimStart = 0.0;
    double trimEndForPeaks = 0.0;
    std::shared_ptr<juce::AudioBuffer<float>> audioBuffer;
    std::vector<float> peaks; // interleaved min/max pairs, normalized -1..1
    bool peaksReady = false;
};

//==============================================================================
/** Shared timeline lane (label + M/S mix id + clips). */
struct TimelineLane
{
    int mixId = 0;          // Project track id or stem id for mute/solo
    juce::String name;
    juce::Array<TimelineClipVisual> clips;
};
