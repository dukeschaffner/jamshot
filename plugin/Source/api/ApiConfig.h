#pragma once

#include <juce_core/juce_core.h>

//==============================================================================
/** Configuration for Sterio API client. */
class ApiConfig
{
public:
    /** Get the base URL for API requests. */
    static juce::String getBaseUrl()
    {
        // TODO: Make this configurable, perhaps from a build setting or config file
        // For now, default to local development
        return "http://localhost:5001/api";
    }

    /** Get the timeout for API requests in milliseconds. */
    static int getRequestTimeoutMs()
    {
        return 10000; // 10 seconds
    }

    /** Get the user agent string for API requests. */
    static juce::String getUserAgent()
    {
        return "SterioPlugin/1.0";
    }
};