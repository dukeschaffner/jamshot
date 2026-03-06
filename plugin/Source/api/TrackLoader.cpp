#include "TrackLoader.h"

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

Array<StemTrack> TrackLoader::loadStemsForTrack(const String& trackId)
{
    if (apiClient == nullptr)
    {
        throw std::runtime_error("No API client set");
    }

    // Download stem metadata
    auto stemDataResult = downloadStemData(trackId);
    if (stemDataResult.failed())
    {
        throw std::runtime_error("Failed to download stem metadata: " + stemDataResult.getErrorMessage());
    }

    // Parse stem data
    Array<StemTrack> stems = parseStemData(*stemDataResult);

    if (stems.isEmpty())
    {
        throw std::runtime_error("No stems found in metadata");
    }

    // Download and decode audio for each stem
    for (int i = 0; i < stems.size(); ++i)
    {
        auto& stem = stems.getReference(i);

        // Use the audio URL from the parsed stem data (CDN URL)
        String audioUrl = stem.audioUrl;

        auto audioResult = downloadAndDecodeAudio(audioUrl);
        if (audioResult.failed())
        {
            throw std::runtime_error("Failed to download/decode audio for stem " + String(stem.trackId) +
                ": " + audioResult.getErrorMessage());
        }

        stem.audioBuffer = *audioResult;
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
        throw std::runtime_error("API request failed: " + result.getErrorMessage());
    }

    return result;
}

ApiResult<AudioBuffer<float>> TrackLoader::downloadAndDecodeAudio(const String& audioUrl)
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
        throw std::runtime_error("HTTP " + String(httpStatus) + ": " + responseText);
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
        throw std::runtime_error("Failed to read complete audio data (" + String(bytesRead) + "/" + String(totalLength) + " bytes)");
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
    AudioBuffer<float> buffer(reader->numChannels, numSamples);
    bool readSuccess = reader->read(&buffer, 0, numSamples, 0, true, true);

    if (!readSuccess)
    {
        throw std::runtime_error("Failed to read audio data into buffer");
    }

    return ApiResult<AudioBuffer<float>>::ok(buffer);
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