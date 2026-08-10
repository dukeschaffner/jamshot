#pragma once

#include <juce_core/juce_core.h>

//==============================================================================
/** Plugin configuration constants. */
class Config
{
public:
    /** Cache configuration */
    class Cache
    {
    public:
        /** Maximum cache size in bytes (default: 1GB) */
        static constexpr int64_t maxSizeBytes = 1073741824LL; // 1GB
    };

    /** API configuration */
    class API
    {
    public:
        /** Base URL for API requests */
        static juce::String getBaseUrl()
        {
            // return "https://api.sterio.fm/api";
            return "http://localhost:5001/api";
        }
    };

    /** UI configuration */
    class UI
    {
    public:
        /** Base URL for web app */
        static juce::String getBaseUrl()
        {
            // return "https://sterio.fm";
            return "http://localhost:3000";
        }
    };

    /** Local unified log aggregator (npm run dev:backend) */
    class DevLog
    {
    public:
        static juce::String getBaseUrl()
        {
            return "http://127.0.0.1:5099";
        }
    };

    /** Plugin metadata configuration */
    class PluginMeta
    {
    public:
        /** Path to plugin metadata file */
        static juce::String getPluginVersion()
        {
            return "0.1.3";
        }
    };
};