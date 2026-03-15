#pragma once

#include <memory>
#include <juce_core/juce_core.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include "SterioApiClient.h"
#include "../SampleRateConverter.h"
#include "../StemModels.h"

// Forward declaration to avoid circular include
class CacheManager;

//==============================================================================
/** TrackLoader class for downloading and decoding stem tracks */
class TrackLoader
{
public:
    TrackLoader(SterioApiClient& apiClientRef, CacheManager& cacheManagerRef);
    ~TrackLoader();

    /** Load all stems for a given track ID.
        Returns an array of StemTrack objects with decoded audio buffers.
        Empty array returned on failure. */
    juce::Array<StemTrack> loadStemsForTrack(const juce::String& trackId);

    /** Load all stems for a given track ID with sample rate conversion.
        Returns an array of StemTrack objects with decoded audio buffers converted to targetSampleRate.
        Empty array returned on failure. */
    juce::Array<StemTrack> loadStemsForTrack(const juce::String& trackId, double targetSampleRate);

private:
    /** Download stem data (JSON) for a track */
    ApiResult<juce::var> downloadStemData(const juce::String& trackId);

    /** Download raw audio data from URL */
    ApiResult<juce::MemoryBlock> downloadAudio(const juce::String& audioUrl);

    /** Decode raw audio data into AudioBuffer */
    ApiResult<std::shared_ptr<juce::AudioBuffer<float>>> decodeAudio(const juce::MemoryBlock& rawAudioData);

    /** Save audio to cache asynchronously (doesn't block loading) */
    void saveAudioToCacheAsync(const juce::String& trackId, juce::MemoryBlock rawAudioData);

    SterioApiClient* apiClient = nullptr;
    CacheManager* cacheManager = nullptr;
    juce::AudioFormatManager formatManager;
    SampleRateConverter sampleRateConverter;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TrackLoader)
};