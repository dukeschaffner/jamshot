#pragma once

#include <memory>
#include <juce_core/juce_core.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include "SterioApiClient.h"

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
};

//==============================================================================
/** TrackLoader class for downloading and decoding stem tracks */
class TrackLoader
{
public:
    TrackLoader();
    ~TrackLoader();

    /** Set the API client for making authenticated requests */
    void setApiClient(SterioApiClient* client);

    /** Load all stems for a given track ID.
        Returns an array of StemTrack objects with decoded audio buffers.
        Empty array returned on failure. */
    juce::Array<StemTrack> loadStemsForTrack(const juce::String& trackId);

private:
    /** Download stem data (JSON) for a track */
    ApiResult<juce::var> downloadStemData(const juce::String& trackId);

    /** Download and decode an MP3 file from URL */
    ApiResult<std::shared_ptr<juce::AudioBuffer<float>>> downloadAndDecodeAudio(const juce::String& audioUrl);

    /** Parse stem data from JSON response */
    juce::Array<StemTrack> parseStemData(const juce::var& json);

    /** Parse a single stem object from JSON */
    StemTrack parseStem(const juce::var& stemJson);

    /** Parse regions array from JSON */
    juce::Array<StemRegion> parseRegions(const juce::var& regionsJson);

    SterioApiClient* apiClient = nullptr;
    juce::AudioFormatManager formatManager;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TrackLoader)
};