#include "CacheManager.h"

using namespace juce;

//==============================================================================

//==============================================================================
CacheManager::CacheManager()
{
    // Initialize audio format manager with basic formats (includes MP3 support)
    formatManager.registerBasicFormats();

    // Set cache size from configuration
    maxCacheSize = Config::Cache::maxSizeBytes;
}

CacheManager::~CacheManager()
{
}

void CacheManager::setCacheDirectory(const File& directory)
{
    cacheDirectory = directory;

    // Create cache directory if it doesn't exist
    if (!cacheDirectory.exists())
        cacheDirectory.createDirectory();

    DBG("CacheManager: Cache directory set to " + cacheDirectory.getFullPathName());
}

bool CacheManager::hasMetadata(const String& trackId) const
{
    return getMetadataFile(trackId).existsAsFile();
}

Result CacheManager::loadMetadata(const String& trackId, var& metadata)
{
    auto metadataFile = getMetadataFile(trackId);

    if (!metadataFile.existsAsFile())
        return Result::fail("Metadata file does not exist for track " + trackId);

    // Read JSON from file
    auto jsonString = metadataFile.loadFileAsString();
    if (jsonString.isEmpty())
        return Result::fail("Failed to read metadata file for track " + trackId);

    // Parse JSON
    auto parsedJson = JSON::parse(jsonString);
    if (parsedJson.isUndefined())
        return Result::fail("Failed to parse metadata JSON for track " + trackId);

    metadata = parsedJson;
    updateLastAccessed(trackId);

    return Result::ok();
}

Result CacheManager::saveMetadata(const String& trackId, const var& metadata)
{
    auto result = ensureTrackDirectoryExists(trackId);
    if (result.failed())
        return result;

    auto metadataFile = getMetadataFile(trackId);

    // Convert to JSON string
    auto jsonString = JSON::toString(metadata, true);

    // Write to file
    if (!metadataFile.replaceWithText(jsonString))
        return Result::fail("Failed to write metadata file for track " + trackId);

    updateLastAccessed(trackId);

    return Result::ok();
}

bool CacheManager::hasAudio(const String& trackId) const
{
    return getAudioFile(trackId).existsAsFile();
}

Result CacheManager::loadAudio(const String& trackId, std::shared_ptr<AudioBuffer<float>>& audioBuffer)
{
    // First try to load raw MP3 data from cache
    MemoryBlock rawAudioData;
    auto rawLoadResult = loadAudioRaw(trackId, rawAudioData);
    if (rawLoadResult.wasOk())
    {
        DBG("CacheManager: Loaded " + String(rawAudioData.getSize()) + " bytes of raw MP3 data for track " + trackId);

        // Decode the raw MP3 data
        std::unique_ptr<MemoryInputStream> memoryStream = std::make_unique<MemoryInputStream>(rawAudioData, false);

        // Create audio format reader from memory stream
        std::unique_ptr<AudioFormatReader> reader(formatManager.createReaderFor(std::move(memoryStream)));

        if (reader == nullptr) {
            DBG("CacheManager: Failed to create MP3 reader for cached track " + trackId);
            return Result::fail("Failed to create audio format reader for cached track " + trackId);
        }

        // Decode audio into buffer
        auto buffer = std::make_shared<AudioBuffer<float>>(reader->numChannels, (int)reader->lengthInSamples);
        bool readSuccess = reader->read(buffer.get(), 0, (int)reader->lengthInSamples, 0, true, true);

        if (!readSuccess)
            return Result::fail("Failed to decode cached audio data for track " + trackId);

        audioBuffer = buffer;
        return Result::ok();
    }

    // Fallback: try loading old encoded format (if any exists)
    auto audioFile = getAudioFile(trackId);

    if (!audioFile.existsAsFile())
        return Result::fail("Audio file does not exist for track " + trackId);

    // Create input stream
    std::unique_ptr<FileInputStream> inputStream(audioFile.createInputStream());

    if (inputStream == nullptr)
        return Result::fail("Failed to create input stream for audio file " + trackId);

    // Create audio format reader
    std::unique_ptr<AudioFormatReader> reader(formatManager.createReaderFor(std::move(inputStream)));

    if (reader == nullptr)
        return Result::fail("Failed to create audio format reader for track " + trackId);

    // Decode audio into buffer
    auto buffer = std::make_shared<AudioBuffer<float>>(reader->numChannels, (int)reader->lengthInSamples);
    bool readSuccess = reader->read(buffer.get(), 0, (int)reader->lengthInSamples, 0, true, true);

    if (!readSuccess)
        return Result::fail("Failed to read audio data for track " + trackId);

    audioBuffer = buffer;
    updateLastAccessed(trackId);

    return Result::ok();
}

Result CacheManager::saveAudioRaw(const String& trackId, const MemoryBlock& rawAudioData)
{
    DBG("CacheManager: Saving " + String(rawAudioData.getSize()) + " bytes of raw MP3 data for track " + trackId);

    auto result = ensureTrackDirectoryExists(trackId);
    if (result.failed())
        return result;

    auto audioFile = getAudioFile(trackId);

    // Write raw MP3 data directly to file
    if (!audioFile.replaceWithData(rawAudioData.getData(), rawAudioData.getSize())) {
        DBG("CacheManager: Failed to write raw MP3 data to file: " + audioFile.getFullPathName());
        return Result::fail("Failed to write raw audio data for track " + trackId);
    }

    DBG("CacheManager: Successfully saved raw MP3 data to: " + audioFile.getFullPathName());

    updateLastAccessed(trackId);
    cleanupIfNeeded();

    return Result::ok();
}

Result CacheManager::loadAudioRaw(const String& trackId, MemoryBlock& rawAudioData)
{
    auto audioFile = getAudioFile(trackId);

    if (!audioFile.existsAsFile())
        return Result::fail("Raw audio file does not exist for track " + trackId);

    // Read raw MP3 data from file
    if (!audioFile.loadFileAsData(rawAudioData))
        return Result::fail("Failed to read raw audio data for track " + trackId);

    updateLastAccessed(trackId);

    return Result::ok();
}

void CacheManager::updateLastAccessed(const String& trackId)
{
    auto result = ensureTrackDirectoryExists(trackId);
    if (result.failed())
        return;

    auto lastAccessedFile = getLastAccessedFile(trackId);

    // Write current timestamp
    auto now = Time::getCurrentTime();
    auto timestampString = String(now.toMilliseconds());

    lastAccessedFile.replaceWithText(timestampString);
}

Time CacheManager::getLastAccessed(const String& trackId) const
{
    auto lastAccessedFile = getLastAccessedFile(trackId);

    if (!lastAccessedFile.existsAsFile())
        return Time();

    auto timestampString = lastAccessedFile.loadFileAsString();
    auto timestampMs = timestampString.getLargeIntValue();

    return Time(timestampMs);
}

void CacheManager::clearCache()
{
    if (cacheDirectory.exists())
        cacheDirectory.deleteRecursively();
}

int64_t CacheManager::getCacheSize() const
{
    if (!cacheDirectory.exists())
        return 0;

    int64_t totalSize = 0;

    // Recursively calculate size of all files in cache directory
    Array<File> files;
    cacheDirectory.findChildFiles(files, File::findFiles, true);

    for (const auto& file : files)
        totalSize += file.getSize();

    return totalSize;
}

void CacheManager::cleanupIfNeeded()
{
    if (maxCacheSize <= 0)
        return; // unlimited

    if (getCacheSize() <= maxCacheSize)
        return; // under limit

    cleanupOldEntries();
}

void CacheManager::cleanupOldEntries()
{
    if (!cacheDirectory.exists())
        return;

    // Get all track directories
    Array<File> trackDirs;
    cacheDirectory.findChildFiles(trackDirs, File::findDirectories, false);

    // Create list of directories with their last accessed times
    struct TrackEntry {
        File directory;
        Time lastAccessed;
    };

    Array<TrackEntry> entries;
    for (const auto& dir : trackDirs)
    {
        auto trackId = dir.getFileName();
        auto lastAccessed = getLastAccessed(trackId);
        entries.add({dir, lastAccessed});
    }

    // Sort by last accessed time (oldest first)
    std::sort(entries.begin(), entries.end(),
              [](const TrackEntry& a, const TrackEntry& b) {
                  return a.lastAccessed < b.lastAccessed;
              });

    // Remove oldest entries until under limit
    int64_t currentSize = getCacheSize();
    for (const auto& entry : entries)
    {
        if (currentSize <= maxCacheSize)
            break;

        // Calculate directory size before deletion
        Array<File> dirFiles;
        entry.directory.findChildFiles(dirFiles, File::findFiles, true);
        int64_t dirSize = 0;
        for (const auto& file : dirFiles)
            dirSize += file.getSize();

        entry.directory.deleteRecursively();
        currentSize -= dirSize;

        DBG("CacheManager: Removed old cache entry: " + entry.directory.getFileName());
    }
}

File CacheManager::getTrackDirectory(const String& trackId) const
{
    return cacheDirectory.getChildFile(trackId);
}

File CacheManager::getMetadataFile(const String& trackId) const
{
    return getTrackDirectory(trackId).getChildFile("metadata.json");
}

File CacheManager::getAudioFile(const String& trackId) const
{
    return getTrackDirectory(trackId).getChildFile("audio.mp3");
}

File CacheManager::getLastAccessedFile(const String& trackId) const
{
    return getTrackDirectory(trackId).getChildFile("last_accessed.txt");
}

Result CacheManager::ensureTrackDirectoryExists(const String& trackId)
{
    auto trackDir = getTrackDirectory(trackId);

    if (!trackDir.exists())
    {
        if (!trackDir.createDirectory())
            return Result::fail("Failed to create cache directory for track " + trackId);
    }

    return Result::ok();
}