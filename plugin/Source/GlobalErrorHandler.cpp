#include "GlobalErrorHandler.h"
#include <juce_gui_basics/juce_gui_basics.h>

#if JUCE_MAC || JUCE_LINUX
#include <execinfo.h>
#include <unistd.h>
#endif

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

    // Set up crash handlers
    setupCrashHandlers();

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

//==============================================================================
// Crash handling implementation
//==============================================================================

namespace
{
    // Signal handler for crashes - must be very minimal!
    void crashSignalHandler(int sig)
    {
        // Write basic crash info to stderr (this is async-signal-safe)
        const char* signalName = "Unknown";
        switch (sig)
        {
            case SIGSEGV: signalName = "SIGSEGV (Segmentation fault)"; break;
            case SIGABRT: signalName = "SIGABRT (Abort)"; break;
            case SIGFPE: signalName = "SIGFPE (Floating point exception)"; break;
            case SIGILL: signalName = "SIGILL (Illegal instruction)"; break;
            case SIGBUS: signalName = "SIGBUS (Bus error)"; break;
            default: break;
        }

        // Use write() which is async-signal-safe
        char buffer[256];
        int len = snprintf(buffer, sizeof(buffer), "\n*** CRASH DETECTED ***\nSignal: %s\n", signalName);
        write(STDERR_FILENO, buffer, static_cast<size_t>(len));

        // Generate and write crash report
        GlobalErrorHandler::writeCrashReport(sig);

        // Re-raise the signal to let the system handle it
        ::signal(sig, SIG_DFL);
        ::raise(sig);
    }
}

void GlobalErrorHandler::setupCrashHandlers()
{
#if JUCE_MAC || JUCE_LINUX
    // Install signal handlers for common crash signals
    struct sigaction sa;
    sa.sa_handler = crashSignalHandler;
    sa.sa_flags = SA_RESTART;
    sigemptyset(&sa.sa_mask);

    // Register handlers for common crash signals
    sigaction(SIGSEGV, &sa, nullptr);  // Segmentation fault
    sigaction(SIGABRT, &sa, nullptr);  // Abort
    sigaction(SIGFPE, &sa, nullptr);   // Floating point exception
    sigaction(SIGILL, &sa, nullptr);   // Illegal instruction
    sigaction(SIGBUS, &sa, nullptr);   // Bus error

    DBG("GlobalErrorHandler::setupCrashHandlers() - Crash signal handlers installed");
#endif
}

void GlobalErrorHandler::writeCrashReport(int sig)
{
    const String crashLogPath = getCrashLogPath();
    const String timestamp = Time::getCurrentTime().toString(true, true, true, true);

    StringArray report;
    report.add("=== STERIO PLUGIN CRASH REPORT ===");
    report.add("Timestamp: " + timestamp);
    report.add("Signal: " + String(sig));
    report.add("");

#if JUCE_MAC || JUCE_LINUX
    // Generate stack trace
    report.add("=== STACK TRACE ===");
    void* buffer[100];
    int nptrs = backtrace(buffer, 100);
    char** strings = backtrace_symbols(buffer, nptrs);

    if (strings != nullptr)
    {
        for (int i = 0; i < nptrs; ++i)
            report.add(String(strings[i]));
        free(strings);
    }
    else
    {
        report.add("Failed to generate stack trace");
    }
    report.add("");
#endif

    // Add system info
    report.add("=== SYSTEM INFO ===");
    report.add("Platform: " + SystemStats::getOperatingSystemName());
    report.add("CPU: " + String(SystemStats::getNumCpus()) + " cores");
    report.add("Memory: " + String(SystemStats::getMemorySizeInMegabytes()) + " MB");
    report.add("");

    // Add plugin info
    report.add("=== PLUGIN INFO ===");
    report.add("Version: " + String(JucePlugin_VersionString));
    report.add("Name: " + String(JucePlugin_Name));
    report.add("");

    // Write to file
    File crashFile(crashLogPath);
    if (crashFile.getParentDirectory().createDirectory())
    {
        crashFile.replaceWithText(report.joinIntoString("\n"));
    }

    // Also write to debug output
    DBG("Crash report written to: " + crashLogPath);
    for (auto& line : report)
        DBG(line);
}

String GlobalErrorHandler::getCrashLogPath()
{
    const File appDataDir = File::getSpecialLocation(File::userApplicationDataDirectory);
    const File pluginDir = appDataDir.getChildFile("SterioPlugin");
    const String timestamp = Time::getCurrentTime().formatted("%Y%m%d_%H%M%S");
    return pluginDir.getChildFile("crash_" + timestamp + ".log").getFullPathName();
}