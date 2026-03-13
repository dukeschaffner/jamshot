#pragma once

#include <memory>
#include <juce_core/juce_core.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include "StemModels.h"
#include "Config.h"

//==============================================================================
/** CacheManager handles persistent caching of stem metadata and audio files */
class CacheManager
{
public:
    CacheManager();
    ~CacheManager();

    /** Set the cache directory. Creates it if it doesn't exist. */
    void setCacheDirectory(const juce::File& directory);

    /** Get the cache directory */
    juce::File getCacheDirectory() const { return cacheDirectory; }

    /** Check if metadata is cached for a track */
    bool hasMetadata(const juce::String& trackId) const;

    /** Load cached metadata for a track */
    juce::Result loadMetadata(const juce::String& trackId, juce::var& metadata);

    /** Save metadata to cache for a track */
    juce::Result saveMetadata(const juce::String& trackId, const juce::var& metadata);

    /** Check if audio is cached for a track */
    bool hasAudio(const juce::String& trackId) const;

    /** Load cached audio for a track */
    juce::Result loadAudio(const juce::String& trackId, std::shared_ptr<juce::AudioBuffer<float>>& audioBuffer);

    /** Load raw cached audio data for a track */
    juce::Result loadAudioRaw(const juce::String& trackId, juce::MemoryBlock& rawAudioData);

    /** Save raw MP3 audio data to cache for a track */
    juce::Result saveAudioRaw(const juce::String& trackId, const juce::MemoryBlock& rawAudioData);

    /** Update last accessed time for a track's cache entry */
    void updateLastAccessed(const juce::String& trackId);

    /** Get last accessed time for a track */
    juce::Time getLastAccessed(const juce::String& trackId) const;

    /** Clear all cached data */
    void clearCache();

    /** Get total cache size in bytes */
    int64_t getCacheSize() const;

    /** Set maximum cache size in bytes (0 = unlimited) */
    void setMaxCacheSize(int64_t sizeBytes) { maxCacheSize = sizeBytes; }

    /** Clean up old cache entries if over size limit */
    void cleanupIfNeeded();

private:
    /** Get the directory for a specific track */
    juce::File getTrackDirectory(const juce::String& trackId) const;

    /** Get the metadata file for a track */
    juce::File getMetadataFile(const juce::String& trackId) const;

    /** Get the audio file for a track */
    juce::File getAudioFile(const juce::String& trackId) const;

    /** Get the last accessed file for a track */
    juce::File getLastAccessedFile(const juce::String& trackId) const;

    /** Create directory structure for a track if needed */
    juce::Result ensureTrackDirectoryExists(const juce::String& trackId);

    /** Clean up cache by removing oldest accessed files */
    void cleanupOldEntries();

    juce::File cacheDirectory;
    juce::AudioFormatManager formatManager;
    int64_t maxCacheSize = 0; // 0 = unlimited

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(CacheManager)
};