#include "PluginMetaHelper.h"
#include "../Config.h"
#include <juce_core/juce_core.h>

PluginMetaHelper& PluginMetaHelper::getInstance()
{
    static PluginMetaHelper instance;
    return instance;
}

PluginMetaHelper::PluginMetaHelper()
{
}

void PluginMetaHelper::ensureLoaded()
{
    if (!isLoaded_)
    {
        loadFromFile();
        isLoaded_ = true;
    }
}

void PluginMetaHelper::loadFromFile()
{
    try{
        auto file = getMetaFile();
        if (file.existsAsFile())
        {
            auto jsonText = file.loadFileAsString();
            auto json = juce::JSON::parse(jsonText);
            if (json.isObject())
            {
                pluginMeta_.latestVersion = json.getProperty("latestVersion", "").toString();
                pluginMeta_.minSupportedVersion = json.getProperty("minSupportedVersion", "").toString();
            }
        }
    }
    catch (const std::exception& e)
    {
        DBG("Failed to load plugin metadata: " + juce::String(e.what()));
    }
    catch (...)
    {
        DBG("Failed to load plugin metadata: unknown exception");
    }

}

void PluginMetaHelper::saveToFile(const PluginMeta& meta)
{
    auto file = getMetaFile();
    file.getParentDirectory().createDirectory();
    juce::var obj = new juce::DynamicObject();
    obj.getDynamicObject()->setProperty("latestVersion", meta.latestVersion);
    obj.getDynamicObject()->setProperty("minSupportedVersion", meta.minSupportedVersion);
    file.replaceWithText(juce::JSON::toString(obj));
}

juce::File PluginMetaHelper::getMetaFile()
{
    return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
        .getChildFile("SterioPlugin")
        .getChildFile("plugin-meta.json");
}

juce::String PluginMetaHelper::GetPluginMetaHeader()
{
    std::lock_guard<std::mutex> lock(mutex_);
    ensureLoaded();

    if (pluginMeta_.latestVersion.isEmpty())
    {
        pluginMeta_.latestVersion = Config::PluginMeta::getPluginVersion();
    }

    juce::String jsonHeader = "{";
    jsonHeader += "\"latestVersion\":\"" + pluginMeta_.latestVersion + "\",";
    jsonHeader += "\"currentVersion\":\"" + Config::PluginMeta::getPluginVersion() + "\"";
    jsonHeader += "}";

    return jsonHeader;
}

void PluginMetaHelper::SetLatestPluginVersionIfPresent(const juce::var& json)
{
    if (json.isObject() && json.hasProperty("meta"))
    {
        auto metaObj = json.getProperty("meta","{}").getDynamicObject();
        if (metaObj->hasProperty("plugin"))
        {
            auto pluginObj = metaObj->getProperty("plugin").getDynamicObject();
            std::lock_guard<std::mutex> lock(mutex_);
            pluginMeta_.latestVersion = pluginObj->getProperty("latestVersion").toString();
            pluginMeta_.minSupportedVersion = pluginObj->getProperty("minSupportedVersion").toString();
            saveToFile(pluginMeta_);
        }
    }
}

bool PluginMetaHelper::IsUpdateAvailable()
{
    std::lock_guard<std::mutex> lock(mutex_);
    ensureLoaded();
    return isVersionGreater(pluginMeta_.latestVersion, Config::PluginMeta::getPluginVersion());
}

bool PluginMetaHelper::isVersionGreater(const juce::String& v1, const juce::String& v2)
{
    auto parts1 = juce::StringArray::fromTokens(v1, ".", "");
    auto parts2 = juce::StringArray::fromTokens(v2, ".", "");

    for (int i = 0; i < std::max(parts1.size(), parts2.size()); ++i)
    {
        int p1 = i < parts1.size() ? parts1[i].getIntValue() : 0;
        int p2 = i < parts2.size() ? parts2[i].getIntValue() : 0;
        if (p1 > p2) return true;
        if (p1 < p2) return false;
    }
    return false;
}