#include "GlobalErrorHandler.h"
#include <juce_gui_basics/juce_gui_basics.h>

using namespace juce;

//==============================================================================
void GlobalErrorHandler::setupGlobalErrorHandling()
{
    // Set up terminate handler for uncaught exceptions
    std::set_terminate([]() {
        try {
            // Try to get current exception if available
            if (auto eptr = std::current_exception()) {
                std::rethrow_exception(eptr);
            } else {
                handleError("Global", "Application terminated abnormally");
            }
        }
        catch (const std::exception& e) {
            handleError("Global", "Uncaught exception caused termination: " + String(e.what()));
        }
        catch (...) {
            handleError("Global", "Unknown exception caused termination");
        }

        // Call the original terminate handler
        std::abort();
    });

    DBG("GlobalErrorHandler::setupGlobalErrorHandling() - Global error handling initialized");
}

void GlobalErrorHandler::handleError(const String& context, const std::exception& e)
{
    handleError(context, String(e.what()));
}

void GlobalErrorHandler::handleError(const String& context, const String& message)
{
    const String formattedMessage = formatErrorMessage(context, message);
    logError(context, message);

    // Show user-friendly dialog on main thread if possible
    if (MessageManager::getInstance() != nullptr)
    {
        MessageManager::callAsync([context, message]() {
            showUserError("Plugin Error",
                "An error occurred in the " + context + " component.\n\n" +
                "The plugin will attempt to continue, but some features may not work correctly.\n\n" +
                "Details: " + message);
        });
    }
}

void GlobalErrorHandler::showUserError(const String& title, const String& message)
{
    AlertWindow::showMessageBoxAsync(AlertWindow::WarningIcon,
        title,
        message,
        "OK");
}

void GlobalErrorHandler::logError(const String& context, const String& message)
{
    const String timestamp = Time::getCurrentTime().toString(true, true, true, true);
    const String logMessage = timestamp + " [" + context + "] ERROR: " + message;

    // Log to debug output
    DBG(logMessage);

    // TODO: Add file logging, crash reporting, etc. for production
}

String GlobalErrorHandler::formatErrorMessage(const String& context, const String& message)
{
    return "[" + context + "] " + message;
}