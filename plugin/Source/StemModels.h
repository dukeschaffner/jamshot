#pragma once

#include <optional>
#include <juce_core/juce_core.h>
#include <juce_audio_formats/juce_audio_formats.h>

//==============================================================================
/** Represents a region within a stem track */
struct StemRegion
{
    double offset = 0.0;    // Offset in seconds
    double startTime = 0.0; // Start time in seconds
    double endTime = 0.0;   // End time in seconds
    double loopEnd = 0.0;   // Absolute timeline end of loop area; 0 or <= endTime = no loop
};

//==============================================================================
/** Represents a stem track with audio buffer and region data */
struct StemTrack
{
    int trackId = 0;                    // Clip/stem ID (legacy + project clip id)
    int projectTrackId = 0;             // Project track id for mute/solo gating (0 = N/A)
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

//==============================================================================
/** Represents a track returned from the API */
struct TrackInfo
{
    juce::String id;
    juce::String title;
    juce::String username; // Artist username
    juce::String duration; // Optional
    juce::String createdAt; // Optional
    juce::String metronome; // Optional
    juce::String timeSignature; // Optional
};

//==============================================================================
/** A completed project clip from GET /projects/:id/plugin-payload */
struct ProjectClip
{
    int clipId = 0;
    int assetId = 0;
    int trackId = 0;
    juce::String audioUrl;
    double startTime = 0.0;
    double trimStart = 0.0;
    std::optional<double> trimEnd;
    std::optional<double> loopEnd;
    float gain = 1.0f;
    float trackGain = 1.0f;
};

//==============================================================================
/** Track metadata for plugin timeline lanes */
struct ProjectTrackInfo
{
    int trackId = 0;
    juce::String name;
    int sortOrder = 0;
    juce::String color;
};

//==============================================================================
/** Summary of a project from GET /projects */
struct ProjectSummary
{
    juce::String guid;
    juce::String name;
    int bpm = 120;
    juce::String timeSignature { "4/4" };
    double durationSeconds = 60.0;
    juce::String role;
    juce::String updatedAt;
};

//==============================================================================
/** Plugin payload for project playback */
struct ProjectPluginPayload
{
    juce::String name;
    int bpm = 120;
    juce::String timeSignature { "4/4" };
    double durationSeconds = 60.0;
    juce::Array<ProjectClip> clips;
    juce::Array<ProjectTrackInfo> tracks;
};

//==============================================================================
/** Active project metadata for plugin UI */
struct ProjectInfo
{
    juce::String guid;
    juce::String name;
    int bpm = 120;
    juce::String timeSignature { "4/4" };
    double durationSeconds = 60.0;
};