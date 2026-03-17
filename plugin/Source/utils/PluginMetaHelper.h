#pragma once

#include <juce_core/juce_core.h>
#include <mutex>

struct PluginMeta
{
    juce::String latestVersion;
    juce::String minSupportedVersion;
};

class PluginMetaHelper
{
public:
    static PluginMetaHelper& getInstance();

    juce::String GetPluginMetaHeader();
    void SetLatestPluginVersionIfPresent(const juce::var& json);
    bool IsUpdateAvailable();

private:
    PluginMetaHelper();
    void ensureLoaded();
    void loadFromFile();
    void saveToFile(const PluginMeta& meta);
    juce::File getMetaFile();
    bool isVersionGreater(const juce::String& v1, const juce::String& v2);

    std::mutex mutex_;
    PluginMeta pluginMeta_;
    bool isLoaded_ = false;
};