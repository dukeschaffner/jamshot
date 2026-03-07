#include "TrackLoader.h"
#include "../CacheManager.h"

using namespace juce;

//==============================================================================
TrackLoader::TrackLoader()
{
    // Initialize audio format manager with MP3 support
    formatManager.registerBasicFormats();
    juce::StringArray formats = formatManager.getWildcardForAllFormats();

}

TrackLoader::~TrackLoader()
{
}

void TrackLoader::setApiClient(SterioApiClient* client)
{
    apiClient = client;
}

void TrackLoader::setCacheManager(CacheManager* cache)
{
    cacheManager = cache;
}

Array<StemTrack> TrackLoader::loadStemsForTrack(const String& trackId)
{
    if (apiClient == nullptr)
    {
        throw std::runtime_error("No API client set");
    }

    var stemDataJson;

    // Try to load metadata from cache first
    bool metadataFromCache = false;
    if (cacheManager != nullptr && cacheManager->hasMetadata(trackId))
    {
        auto cacheResult = cacheManager->loadMetadata(trackId, stemDataJson);
        if (cacheResult.wasOk())
        {
            metadataFromCache = true;
            DBG("TrackLoader: Loaded metadata from cache for track " + trackId);
        }
        else
        {
            DBG("TrackLoader: Failed to load cached metadata for track " + trackId + ": " + cacheResult.getErrorMessage());
        }
    }

    // Download metadata if not in cache or cache load failed
    if (!metadataFromCache)
    {
        auto stemDataResult = downloadStemData(trackId);
        if (stemDataResult.failed())
        {
            throw std::runtime_error(("Failed to download stem metadata: " + stemDataResult.getErrorMessage()).toStdString());
        }

        stemDataJson = *stemDataResult;

        // Save to cache if available
        if (cacheManager != nullptr)
        {
            auto saveResult = cacheManager->saveMetadata(trackId, stemDataJson);
            if (saveResult.failed())
            {
                DBG("TrackLoader: Failed to save metadata to cache: " + saveResult.getErrorMessage());
            }
        }
    }

    // Parse stem data
    Array<StemTrack> stems = parseStemData(stemDataJson);

    if (stems.isEmpty())
    {
        throw std::runtime_error("No stems found in metadata");
    }

    // Load audio for each stem
    for (int i = 0; i < stems.size(); ++i)
    {
        auto& stem = stems.getReference(i);
        String stemTrackId = String(stem.trackId);

        // Try to load audio from cache first
        bool audioFromCache = false;
        if (cacheManager != nullptr && cacheManager->hasAudio(stemTrackId))
        {
            std::shared_ptr<AudioBuffer<float>> cachedAudio;
            auto cacheResult = cacheManager->loadAudio(stemTrackId, cachedAudio);
            if (cacheResult.wasOk())
            {
                stem.audioBuffer = cachedAudio;
                audioFromCache = true;
                DBG("TrackLoader: Loaded audio from cache for stem " + stemTrackId);
            }
            else
            {
                DBG("TrackLoader: Failed to load cached audio for stem " + stemTrackId + ": " + cacheResult.getErrorMessage());
            }
        }

        // Download audio if not in cache or cache load failed
        if (!audioFromCache)
        {
            // Use the audio URL from the parsed stem data (CDN URL)
            String audioUrl = stem.audioUrl;

            auto audioResult = downloadAndDecodeAudio(audioUrl);
            if (audioResult.failed())
            {
                throw std::runtime_error(("Failed to download/decode audio for stem " + String(stem.trackId) +
                    ": " + audioResult.getErrorMessage()).toStdString());
            }

            stem.audioBuffer = *audioResult;

            // Save raw MP3 to cache asynchronously (doesn't block loading)
            if (cacheManager != nullptr)
            {
                auto rawAudioResult = downloadAudioRaw(audioUrl);
                if (rawAudioResult.wasOk())
                {
                    // Move the raw data to async thread to avoid copying
                    saveAudioToCacheAsync(stemTrackId, std::move(*rawAudioResult));
                }
                else
                {
                    DBG("TrackLoader: Failed to download raw audio for caching: " + rawAudioResult.getErrorMessage());
                }
            }
        }

        // If stem has no regions, create a default region covering the entire stem
        if (stem.regions.isEmpty())
        {
            StemRegion defaultRegion;
            defaultRegion.startTime = 0.0;
            // Use actual sample rate for duration calculation (will be updated after conversion if needed)
            double sampleRateForDuration = 44100.0; // Default to 44.1kHz, will be corrected after loading
            if (stem.audioBuffer)
                sampleRateForDuration = 44100.0; // Original source is always 44.1kHz
            defaultRegion.endTime = stem.audioBuffer->getNumSamples() / sampleRateForDuration;
            defaultRegion.offset = 0.0;
            stem.regions.add(defaultRegion);
        }
    }

    return stems;
}

ApiResult<var> TrackLoader::downloadStemData(const String& trackId)
{
    if (apiClient == nullptr)
    {
        throw std::runtime_error("No API client set");
    }

    // Construct endpoint for stem data
    String endpoint = "/tracks/" + trackId + "/stems";

    auto result = apiClient->makeAuthenticatedGetRequest(endpoint);

    if (result.failed())
    {
        throw std::runtime_error(("API request failed: " + result.getErrorMessage()).toStdString());
    }

    return result;
}

ApiResult<std::shared_ptr<AudioBuffer<float>>> TrackLoader::downloadAndDecodeAudio(const String& audioUrl)
{
    URL url(audioUrl);

    // Create input stream
    int httpStatus = 0;
    URL::InputStreamOptions options = URL::InputStreamOptions(URL::ParameterHandling::inAddress)
        .withHttpRequestCmd("GET")
        .withConnectionTimeoutMs(30000) // 30 second timeout
        .withStatusCode(&httpStatus);

    std::unique_ptr<InputStream> stream(url.createInputStream(options));
    if (stream == nullptr)
    {
        throw std::runtime_error("Failed to create HTTP request stream for audio download");
    }

    if (httpStatus != 200)
    {
        String responseText = stream->readEntireStreamAsString();
        throw std::runtime_error(("HTTP " + String(httpStatus) + ": " + responseText).toStdString());
    }

    // Read entire stream into memory for seekable access (required for MP3 decoding)
    MemoryBlock audioData;
    auto totalLength = stream->getTotalLength();
    if (totalLength <= 0)
    {
        throw std::runtime_error("Invalid stream length for audio data");
    }

    audioData.setSize(static_cast<size_t>(totalLength));
    auto bytesRead = stream->read(static_cast<char*>(audioData.getData()), static_cast<int>(totalLength));
    if (bytesRead != totalLength)
    {
        throw std::runtime_error(("Failed to read complete audio data (" + String(bytesRead) + "/" + String(totalLength) + " bytes)").toStdString());
    }

    // Create memory input stream for seekable access
    std::unique_ptr<MemoryInputStream> memoryStream = std::make_unique<MemoryInputStream>(audioData, false);

    // Create audio format reader from memory stream
    std::unique_ptr<AudioFormatReader> reader(formatManager.createReaderFor(std::move(memoryStream)));
    if (reader == nullptr)
    {
        throw std::runtime_error("Failed to create audio format reader - unsupported format or corrupted file");
    }

    // Decode audio into buffer
    auto numSamples = static_cast<int>(reader->lengthInSamples);
    auto buffer = std::make_shared<AudioBuffer<float>>(reader->numChannels, numSamples);
    bool readSuccess = reader->read(buffer.get(), 0, numSamples, 0, true, true);

    if (!readSuccess)
    {
        throw std::runtime_error("Failed to read audio data into buffer");
    }

    return ApiResult<std::shared_ptr<AudioBuffer<float>>>::ok(buffer);
}

ApiResult<MemoryBlock> TrackLoader::downloadAudioRaw(const String& audioUrl)
{
    URL url(audioUrl);

    // Create input stream
    int httpStatus = 0;
    URL::InputStreamOptions options = URL::InputStreamOptions(URL::ParameterHandling::inAddress)
        .withHttpRequestCmd("GET")
        .withConnectionTimeoutMs(30000) // 30 second timeout
        .withStatusCode(&httpStatus);

    std::unique_ptr<InputStream> stream(url.createInputStream(options));
    if (stream == nullptr)
        return ApiResult<MemoryBlock>::fail("Failed to create HTTP request stream for audio download");

    if (httpStatus != 200)
    {
        String responseText = stream->readEntireStreamAsString();
        return ApiResult<MemoryBlock>::fail("HTTP " + String(httpStatus) + ": " + responseText);
    }

    // Read entire stream into memory block (keep as raw MP3 data)
    MemoryBlock audioData;
    auto totalLength = stream->getTotalLength();
    if (totalLength <= 0)
        return ApiResult<MemoryBlock>::fail("Invalid stream length for audio data");

    audioData.setSize(static_cast<size_t>(totalLength));
    auto bytesRead = stream->read(static_cast<char*>(audioData.getData()), static_cast<int>(totalLength));
    if (bytesRead != totalLength)
        return ApiResult<MemoryBlock>::fail("Failed to read complete audio data (" + String(bytesRead) + "/" + String(totalLength) + " bytes)");

    return ApiResult<MemoryBlock>::ok(audioData);
}

void TrackLoader::saveAudioToCacheAsync(const String& trackId, MemoryBlock rawAudioData)
{
    if (cacheManager == nullptr)
        return;

    // Launch async thread for cache save
    juce::Thread::launch([this, trackId, audioData = std::move(rawAudioData)]() mutable {
        auto saveResult = cacheManager->saveAudioRaw(trackId, audioData);
        if (saveResult.failed()) {
            DBG("TrackLoader: Async cache save failed for track " + trackId + ": " + saveResult.getErrorMessage());
        } else {
            DBG("TrackLoader: Successfully saved to cache (async): " + trackId);
        }
    });
}

Array<StemTrack> TrackLoader::parseStemData(const var& json)
{
    Array<StemTrack> stems;

    // Check if response is directly an array of stems, or has "stems" property
    var stemsArray;
    if (json.isArray())
    {
        // Response is directly an array of stems
        stemsArray = json;
    }
    else
    {
        // Try to get "stems" property from object response
        stemsArray = json.getProperty("stems", var());
        if (!stemsArray.isArray())
        {
            // Get available property names for debugging
            StringArray propertyNames;
            if (auto* obj = json.getDynamicObject())
            {
                for (auto& prop : obj->getProperties())
                    propertyNames.add(prop.name.toString());
            }
            return stems;
        }
    }

    for (int i = 0; i < stemsArray.size(); ++i)
    {
        var stemJson = stemsArray[i];

        StemTrack stem = parseStem(stemJson);
        stems.add(stem);
    }

    return stems;
}

StemTrack TrackLoader::parseStem(const var& stemJson)
{
    StemTrack stem;

    stem.trackId = stemJson.getProperty("track_id", 0);
    stem.audioUrl = stemJson.getProperty("audio_url", "").toString();
    stem.gain = (float)stemJson.getProperty("gain", 0.8);
    stem.order = stemJson.getProperty("order", 0);

    // Parse regions if present
    var regionsJson = stemJson.getProperty("regions", var());
    if (regionsJson.isArray())
    {
        stem.regions = parseRegions(regionsJson);
    }

    return stem;
}

Array<StemRegion> TrackLoader::parseRegions(const var& regionsJson)
{
    Array<StemRegion> regions;

    for (int i = 0; i < regionsJson.size(); ++i)
    {
        var regionJson = regionsJson[i];
        StemRegion region;

        region.offset = regionJson.getProperty("offset", 0.0);
        region.startTime = regionJson.getProperty("startTime", 0.0);
        region.endTime = regionJson.getProperty("endTime", 0.0);

        regions.add(region);

    }

    return regions;
}

Array<StemTrack> TrackLoader::loadStemsForTrack(const String& trackId, double targetSampleRate)
{
    // Load stems at original 44.1kHz sample rate first
    Array<StemTrack> stems = loadStemsForTrack(trackId);

    if (stems.isEmpty())
        return stems;

    // Check if conversion is needed
    if (!SampleRateConverter::needsConversion(44100.0, targetSampleRate))
        return stems;

    // Check if target sample rate is supported
    if (!SampleRateConverter::isSampleRateSupported(targetSampleRate))
    {
        DBG("TrackLoader: Target sample rate " + String(targetSampleRate) + " Hz not supported, returning original stems");
        return stems;
    }

    DBG("TrackLoader: Converting stems from 44100 Hz to " + String(targetSampleRate) + " Hz");

    // Convert each stem to target sample rate
    for (auto& stem : stems)
    {
        if (stem.audioBuffer)
        {
            auto convertedBuffer = sampleRateConverter.convertSampleRate(
                *stem.audioBuffer, 44100.0, targetSampleRate);

            if (convertedBuffer)
            {
                // Replace original buffer with converted one
                stem.audioBuffer = convertedBuffer;
                DBG("TrackLoader: Successfully converted stem to " + String(targetSampleRate) + " Hz");

                // Update region timings to account for sample rate change
                double ratio = targetSampleRate / 44100.0;
                for (auto& region : stem.regions)
                {
                    region.startTime *= ratio;
                    region.endTime *= ratio;
                    region.offset *= ratio;
                }
            }
            else
            {
                DBG("TrackLoader: Failed to convert stem to " + String(targetSampleRate) + " Hz");
            }
        }
    }

    return stems;
}