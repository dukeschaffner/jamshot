#pragma once

#include <juce_core/juce_core.h>
#include "../Config.h"

//==============================================================================
/** Configuration for Sterio API client. */
class ApiConfig
{
public:
    /** Get the base URL for API requests. */
    static juce::String getBaseUrl()
    {
        return Config::API::getBaseUrl();
    }

    /** Get the UI base URL for web app. */
    static juce::String getUIBaseUrl()
    {
        return Config::UI::getBaseUrl();
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