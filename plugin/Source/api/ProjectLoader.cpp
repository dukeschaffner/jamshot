#include "ProjectLoader.h"
#include "../CacheManager.h"
#include "../utils/JsonUtils.h"
#include "../utils/MessageStore.h"
#include <atomic>
#include <chrono>
#include <map>
#include <mutex>
#include <vector>

using namespace juce;

namespace
{
    constexpr double kProjectSourceSampleRate = 44100.0;

    struct AssetLoadRequest
    {
        int assetId = 0;
        String audioUrl;
    };
}

//==============================================================================
ProjectLoader::ProjectLoader(SterioApiClient& apiClientRef, CacheManager& cacheManagerRef)
    : apiClient(&apiClientRef)
    , cacheManager(&cacheManagerRef)
{
    formatManager.registerBasicFormats();
}

ProjectLoader::~ProjectLoader() = default;

void ProjectLoader::setLoadProgressCallback(LoadProgressCallback callback)
{
    loadProgressCallback = std::move(callback);
}

ApiResult<ProjectPluginPayload> ProjectLoader::fetchPluginPayload(const juce::String& projectId)
{
    if (apiClient == nullptr)
        return ApiResult<ProjectPluginPayload>::fail("No API client set");

    auto result = apiClient->makeAuthenticatedGetRequest("/projects/" + projectId + "/plugin-payload");
    if (result.failed())
        return ApiResult<ProjectPluginPayload>::fail(result.getErrorMessage());

    return ApiResult<ProjectPluginPayload>::ok(JsonUtils::parseProjectPluginPayload(*result));
}

Array<StemTrack> ProjectLoader::loadProjectClips(const String& projectId,
                                                 const Array<ProjectClip>& clips)
{
    std::map<int, std::shared_ptr<AudioBuffer<float>>> assetBuffers;
    Array<StemTrack> stems;

    std::map<int, String> assetUrls;
    for (const auto& clip : clips)
    {
        if (clip.assetId > 0 && clip.audioUrl.isNotEmpty())
            assetUrls.emplace(clip.assetId, clip.audioUrl);
    }

    const int totalAssets = static_cast<int>(assetUrls.size());
    if (loadProgressCallback && totalAssets > 0)
        loadProgressCallback(0, totalAssets);

    if (totalAssets > 0)
    {
        std::vector<AssetLoadRequest> requests;
        requests.reserve(static_cast<size_t>(totalAssets));
        for (const auto& [assetId, audioUrl] : assetUrls)
            requests.push_back({ assetId, audioUrl });

        std::mutex buffersMutex;
        std::mutex cacheMutex;
        std::mutex errorMutex;
        std::atomic<int> assetsLoaded { 0 };
        std::atomic<int> remainingJobs { totalAssets };
        std::atomic<bool> loadFailed { false };
        String failureMessage;
        WaitableEvent allAssetsLoaded;

        for (const auto& request : requests)
        {
            Thread::launch([&, request]() {
                struct JobDoneGuard
                {
                    std::atomic<int>& remaining;
                    WaitableEvent& done;
                    ~JobDoneGuard()
                    {
                        if (remaining.fetch_sub(1) == 1)
                            done.signal();
                    }
                } guard { remainingJobs, allAssetsLoaded };

                if (loadFailed.load())
                    return;

                try
                {
                    std::shared_ptr<AudioBuffer<float>> buffer;

                    {
                        std::lock_guard<std::mutex> lock(cacheMutex);
                        if (cacheManager != nullptr && cacheManager->hasProjectAssetAudio(projectId, request.assetId))
                        {
                            auto cacheResult = cacheManager->loadProjectAssetAudio(projectId, request.assetId, buffer);
                            if (cacheResult.wasOk() && buffer)
                            {
                                DBG("ProjectLoader: Loaded cached audio for project asset " + String(request.assetId));
                            }
                        }
                    }

                    if (!buffer)
                    {
                        auto rawAudioResult = downloadAudio(request.audioUrl);
                        if (rawAudioResult.failed())
                            throw std::runtime_error(("Failed to download project asset audio: "
                                                      + rawAudioResult.getErrorMessage()).toStdString());

                        auto decodeResult = decodeAudio(*rawAudioResult);
                        if (decodeResult.failed())
                            throw std::runtime_error(("Failed to decode project asset audio: "
                                                      + decodeResult.getErrorMessage()).toStdString());

                        buffer = *decodeResult;

                        if (cacheManager != nullptr)
                            saveAssetAudioToCacheAsync(projectId, request.assetId, std::move(*rawAudioResult));
                    }

                    if (!buffer)
                        throw std::runtime_error("Failed to load audio for project asset "
                                                 + String(request.assetId).toStdString());

                    {
                        std::lock_guard<std::mutex> lock(buffersMutex);
                        assetBuffers.emplace(request.assetId, buffer);
                    }

                    const int loaded = assetsLoaded.fetch_add(1) + 1;
                    if (loadProgressCallback)
                        loadProgressCallback(loaded, totalAssets);
                }
                catch (const std::exception& e)
                {
                    bool expected = false;
                    if (loadFailed.compare_exchange_strong(expected, true))
                    {
                        std::lock_guard<std::mutex> lock(errorMutex);
                        failureMessage = e.what();
                    }
                }
            });
        }

        if (!allAssetsLoaded.wait(120000))
            throw std::runtime_error("Timed out loading project audio assets");

        if (loadFailed.load())
            throw std::runtime_error(failureMessage.toStdString());

        if (static_cast<int>(assetBuffers.size()) != totalAssets)
            throw std::runtime_error("Failed to load all project audio assets");
    }

    for (const auto& clip : clips)
    {
        if (clip.assetId <= 0 || clip.audioUrl.isEmpty())
            continue;

        auto assetIt = assetBuffers.find(clip.assetId);
        if (assetIt == assetBuffers.end())
            throw std::runtime_error("Missing audio buffer for project asset " + String(clip.assetId).toStdString());

        stems.add(clipToStemTrack(clip, assetIt->second));
    }

    if (stems.isEmpty())
        throw std::runtime_error("No playable clips in project payload");

    return stems;
}

Array<StemTrack> ProjectLoader::loadProjectClips(const String& projectId,
                                                 const Array<ProjectClip>& clips,
                                                 double targetSampleRate)
{
    auto stems = loadProjectClips(projectId, clips);

    if (stems.isEmpty())
        return stems;

    if (!SampleRateConverter::needsConversion(kProjectSourceSampleRate, targetSampleRate))
        return stems;

    if (!SampleRateConverter::isSampleRateSupported(targetSampleRate))
    {
        DBG("ProjectLoader: Target sample rate " + String(targetSampleRate) + " Hz not supported");
        return stems;
    }

    for (auto& stem : stems)
    {
        if (!stem.audioBuffer)
            continue;

        auto convertedBuffer = sampleRateConverter.convertSampleRate(
            *stem.audioBuffer, kProjectSourceSampleRate, targetSampleRate);

        if (convertedBuffer)
            stem.audioBuffer = convertedBuffer;
    }

    return stems;
}

juce::Array<StemTrack> ProjectLoader::syncProjectClips(const String& projectId,
                                                       const Array<ProjectClip>& previousClips,
                                                       const Array<ProjectClip>& newClips,
                                                       const Array<StemTrack>& existingStems,
                                                       double targetSampleRate)
{
    if (newClips.isEmpty())
        return {};

    std::map<int, int> previousAssetByClipId;
    for (const auto& clip : previousClips)
        previousAssetByClipId.emplace(clip.clipId, clip.assetId);

    std::map<int, std::shared_ptr<AudioBuffer<float>>> assetBuffers;
    for (const auto& stem : existingStems)
    {
        if (!stem.audioBuffer)
            continue;

        const auto previousAssetIt = previousAssetByClipId.find(stem.trackId);
        if (previousAssetIt != previousAssetByClipId.end() && previousAssetIt->second > 0)
            assetBuffers.emplace(previousAssetIt->second, stem.audioBuffer);
    }

    std::map<int, String> assetUrls;
    for (const auto& clip : newClips)
    {
        if (clip.assetId > 0 && clip.audioUrl.isNotEmpty())
            assetUrls.emplace(clip.assetId, clip.audioUrl);
    }

    for (const auto& [assetId, audioUrl] : assetUrls)
    {
        if (assetBuffers.find(assetId) != assetBuffers.end() && assetBuffers[assetId])
            continue;

        assetBuffers[assetId] = loadAssetAudio(projectId, assetId, audioUrl);
    }

    Array<StemTrack> stems;
    for (const auto& clip : newClips)
    {
        if (clip.assetId <= 0 || clip.audioUrl.isEmpty())
            continue;

        const auto assetIt = assetBuffers.find(clip.assetId);
        if (assetIt == assetBuffers.end() || !assetIt->second)
            throw std::runtime_error("Missing audio buffer for project asset "
                                     + String(clip.assetId).toStdString());

        stems.add(clipToStemTrack(clip, assetIt->second));
    }

    if (stems.isEmpty())
        return stems;

    if (!SampleRateConverter::needsConversion(kProjectSourceSampleRate, targetSampleRate))
        return stems;

    if (!SampleRateConverter::isSampleRateSupported(targetSampleRate))
    {
        DBG("ProjectLoader: Target sample rate " + String(targetSampleRate) + " Hz not supported");
        return stems;
    }

    for (auto& stem : stems)
    {
        if (!stem.audioBuffer)
            continue;

        auto convertedBuffer = sampleRateConverter.convertSampleRate(
            *stem.audioBuffer, kProjectSourceSampleRate, targetSampleRate);

        if (convertedBuffer)
            stem.audioBuffer = convertedBuffer;
    }

    return stems;
}

ApiResult<MemoryBlock> ProjectLoader::downloadAudio(const String& audioUrl)
{
    URL url(audioUrl);

    int httpStatus = 0;
    URL::InputStreamOptions options = URL::InputStreamOptions(URL::ParameterHandling::inAddress)
        .withHttpRequestCmd("GET")
        .withConnectionTimeoutMs(30000)
        .withStatusCode(&httpStatus);

    std::unique_ptr<InputStream> stream(url.createInputStream(options));
    if (stream == nullptr)
        return ApiResult<MemoryBlock>::fail("Failed to create HTTP request stream for audio download");

    if (httpStatus != 200)
    {
        String responseText = stream->readEntireStreamAsString();
        return ApiResult<MemoryBlock>::fail("HTTP " + String(httpStatus) + ": " + responseText);
    }

    MemoryBlock audioData;
    auto totalLength = stream->getTotalLength();
    if (totalLength <= 0)
        return ApiResult<MemoryBlock>::fail("Invalid stream length for audio data");

    audioData.setSize(static_cast<size_t>(totalLength));
    auto bytesRead = stream->read(static_cast<char*>(audioData.getData()), static_cast<int>(totalLength));
    if (bytesRead != totalLength)
        return ApiResult<MemoryBlock>::fail("Failed to read complete audio data");

    return ApiResult<MemoryBlock>::ok(audioData);
}

ApiResult<std::shared_ptr<AudioBuffer<float>>> ProjectLoader::decodeAudio(const MemoryBlock& rawAudioData)
{
    std::unique_ptr<MemoryInputStream> memoryStream = std::make_unique<MemoryInputStream>(rawAudioData, false);
    std::unique_ptr<AudioFormatReader> reader(formatManager.createReaderFor(std::move(memoryStream)));

    if (reader == nullptr)
        return ApiResult<std::shared_ptr<AudioBuffer<float>>>::fail("Failed to create audio format reader");

    auto numSamples = static_cast<int>(reader->lengthInSamples);
    auto buffer = std::make_shared<AudioBuffer<float>>(reader->numChannels, numSamples);
    bool readSuccess = reader->read(buffer.get(), 0, numSamples, 0, true, true);

    if (!readSuccess)
        return ApiResult<std::shared_ptr<AudioBuffer<float>>>::fail("Failed to read audio data into buffer");

    return ApiResult<std::shared_ptr<AudioBuffer<float>>>::ok(buffer);
}

std::shared_ptr<AudioBuffer<float>> ProjectLoader::loadAssetAudio(const String& projectId,
                                                                  int assetId,
                                                                  const String& audioUrl)
{
    if (cacheManager != nullptr && cacheManager->hasProjectAssetAudio(projectId, assetId))
    {
        std::shared_ptr<AudioBuffer<float>> cachedAudio;
        auto cacheResult = cacheManager->loadProjectAssetAudio(projectId, assetId, cachedAudio);
        if (cacheResult.wasOk() && cachedAudio)
        {
            DBG("ProjectLoader: Loaded cached audio for project asset " + String(assetId));
            return cachedAudio;
        }
    }

    auto rawAudioResult = downloadAudio(audioUrl);
    if (rawAudioResult.failed())
        throw std::runtime_error(("Failed to download project asset audio: " + rawAudioResult.getErrorMessage()).toStdString());

    MemoryBlock rawAudioData = *rawAudioResult;

    auto decodeResult = decodeAudio(rawAudioData);
    if (decodeResult.failed())
        throw std::runtime_error(("Failed to decode project asset audio: " + decodeResult.getErrorMessage()).toStdString());

    if (cacheManager != nullptr)
        saveAssetAudioToCacheAsync(projectId, assetId, std::move(rawAudioData));

    return *decodeResult;
}

void ProjectLoader::saveAssetAudioToCacheAsync(const String& projectId,
                                               int assetId,
                                               MemoryBlock rawAudioData)
{
    if (cacheManager == nullptr)
        return;

    juce::Thread::launch([this, projectId, assetId, audioData = std::move(rawAudioData)]() mutable {
        auto saveResult = cacheManager->saveProjectAssetAudioRaw(projectId, assetId, audioData);
        if (saveResult.failed())
            DBG("ProjectLoader: Async cache save failed for asset " + String(assetId) + ": " + saveResult.getErrorMessage());
    });
}

StemTrack ProjectLoader::clipToStemTrack(const ProjectClip& clip,
                                         const std::shared_ptr<AudioBuffer<float>>& audioBuffer) const
{
    StemTrack stem;
    stem.trackId = clip.clipId;
    stem.order = clip.trackId;
    stem.audioUrl = clip.audioUrl;
    stem.gain = clip.gain * clip.trackGain;
    stem.audioBuffer = audioBuffer;

    StemRegion region;
    region.startTime = clip.startTime;
    region.offset = clip.trimStart;

    const double assetDurationSec = audioBuffer
        ? static_cast<double>(audioBuffer->getNumSamples()) / kProjectSourceSampleRate
        : 0.0;
    const double trimEnd = clip.trimEnd.has_value() ? *clip.trimEnd : assetDurationSec;
    const double clipDuration = juce::jmax(0.0, trimEnd - clip.trimStart);
    region.endTime = clip.startTime + clipDuration;

    stem.regions.add(region);
    return stem;
}
