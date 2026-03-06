#pragma once

#include <juce_core/juce_core.h>

//==============================================================================
/** Global error handler for the Sterio plugin.
    Provides centralized error handling, logging, and user notifications.
*/
class GlobalErrorHandler
{
public:
    /** Initialize global error handling for the plugin. */
    static void setupGlobalErrorHandling();

    /** Handle a caught exception with context. */
    static void handleError(const juce::String& context, const std::exception& e);

    /** Handle an error message with context. */
    static void handleError(const juce::String& context, const juce::String& message);

    /** Show a user-friendly error dialog. */
    static void showUserError(const juce::String& title, const juce::String& message);

private:
    /** Log an error to debug output and potentially external logging. */
    static void logError(const juce::String& context, const juce::String& message);

    /** Format error message for logging. */
    static juce::String formatErrorMessage(const juce::String& context, const juce::String& message);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GlobalErrorHandler)
};