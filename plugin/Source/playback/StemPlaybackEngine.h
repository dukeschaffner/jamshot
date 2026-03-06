#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include "../api/TrackLoader.h"
#include "../TransportState.h"

//==============================================================================
/** StemPlaybackEngine handles the playback of multiple audio stems in sync with DAW transport */
class StemPlaybackEngine
{
public:
    StemPlaybackEngine();
    ~StemPlaybackEngine();

    /** Set the stems to play back */
    void setStems(const juce::Array<StemTrack>& stems);

    /** Process a block of audio. Call this from your processBlock method */
    void processBlock(juce::AudioBuffer<float>& buffer, const TransportState& transport);

    /** Reset playback position (call when transport stops/starts) */
    void resetPlayback();

private:
    /** Process a single stem with region-based playback */
    void processStem(const StemTrack& stem, juce::AudioBuffer<float>& buffer,
                    const TransportState& transport, double sampleRate, int numSamples);

    juce::Array<StemTrack> activeStems;
    juce::CriticalSection stemLock; // Protect activeStems array access
    int64_t playbackSamplePosition = 0;
    int64_t previousTransportPosition = -1; // Track previous transport position to detect seeks
    bool wasPlaying = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(StemPlaybackEngine)
};