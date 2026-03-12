#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <functional>
#include "../api/TrackLoader.h"
#include "../StemModels.h"
#include "../TransportState.h"
#include "../SampleRateConverter.h"

//==============================================================================
/** StemPlaybackEngine handles the playback of multiple audio stems in sync with DAW transport */
class StemPlaybackEngine
{
public:
    /** Function type for providing stems atomically */
    using StemsProvider = std::function<juce::Array<StemTrack>()>;

    StemPlaybackEngine();
    ~StemPlaybackEngine();

    /** Set the provider function that returns stems atomically. Called from processBlock. */
    void setStemsProvider(StemsProvider provider);

    /** Process a block of audio. Call this from your processBlock method */
    void processBlock(juce::AudioBuffer<float>& buffer, const TransportState& transport);

    /** Reset playback position (call when transport stops/starts) */
    void resetPlayback();

    /** Prepare for playback with given sample rate and block size */
    void prepareToPlay(double sampleRate, int samplesPerBlock);

    /** Handle sample rate changes and convert stems if necessary */
    void handleSampleRateChange(double newSampleRate);

    /** Set callback for requesting stem reloads */
    void setStemReloadCallback(std::function<void()> callback) { stemReloadCallback = callback; }

private:
    /** Process a single stem with region-based playback */
    void processStem(const StemTrack& stem, juce::AudioBuffer<float>& buffer,
                    const TransportState& transport, double sampleRate, int numSamples);

    StemsProvider stemsProvider; // Provider function for atomically accessing stems
    int64_t playbackSamplePosition = 0;
    int64_t previousTransportPosition = -1; // Track previous transport position to detect seeks
    bool wasPlaying = false;

    // Sample rate conversion support
    double currentSampleRate = 44100.0;
    SampleRateConverter sampleRateConverter;

    // Stem reload callback
    std::function<void()> stemReloadCallback;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(StemPlaybackEngine)
};