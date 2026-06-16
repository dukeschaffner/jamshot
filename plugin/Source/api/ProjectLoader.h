#pragma once

#include <map>
#include <memory>
#include <juce_core/juce_core.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include "SterioApiClient.h"
#include "../SampleRateConverter.h"
#include "../StemModels.h"

class CacheManager;

//==============================================================================
/** ProjectLoader downloads project clip audio and maps clips to StemTrack playback. */
class ProjectLoader
{
public:
    ProjectLoader(SterioApiClient& apiClientRef, CacheManager& cacheManagerRef);
    ~ProjectLoader();

    /** Fetch plugin payload from API. */
    ApiResult<ProjectPluginPayload> fetchPluginPayload(const juce::String& projectId);

    /** Load clips into StemTracks with audio cached by (project_id, asset_id). */
    juce::Array<StemTrack> loadProjectClips(const juce::String& projectId,
                                            const juce::Array<ProjectClip>& clips);

    /** Same as loadProjectClips with host sample rate conversion. */
    juce::Array<StemTrack> loadProjectClips(const juce::String& projectId,
                                            const juce::Array<ProjectClip>& clips,
                                            double targetSampleRate);

    using LoadProgressCallback = std::function<void(int current, int total)>;

    /** Optional callback invoked as each distinct project asset is loaded (0..total). */
    void setLoadProgressCallback(LoadProgressCallback callback);

private:
    ApiResult<juce::MemoryBlock> downloadAudio(const juce::String& audioUrl);
    ApiResult<std::shared_ptr<juce::AudioBuffer<float>>> decodeAudio(const juce::MemoryBlock& rawAudioData);

    std::shared_ptr<juce::AudioBuffer<float>> loadAssetAudio(const juce::String& projectId,
                                                             int assetId,
                                                             const juce::String& audioUrl);

    void saveAssetAudioToCacheAsync(const juce::String& projectId,
                                    int assetId,
                                    juce::MemoryBlock rawAudioData);

    StemTrack clipToStemTrack(const ProjectClip& clip,
                              const std::shared_ptr<juce::AudioBuffer<float>>& audioBuffer) const;

    SterioApiClient* apiClient = nullptr;
    CacheManager* cacheManager = nullptr;
    LoadProgressCallback loadProgressCallback;
    juce::AudioFormatManager formatManager;
    SampleRateConverter sampleRateConverter;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProjectLoader)
};
