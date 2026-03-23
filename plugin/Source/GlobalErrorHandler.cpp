#include "GlobalErrorHandler.h"
#include <juce_gui_basics/juce_gui_basics.h>

#if JUCE_MAC || JUCE_LINUX
#include <execinfo.h>
#include <unistd.h>
#include <signal.h>
#include <stdio.h>
#endif

#if JUCE_WINDOWS
#include <windows.h>
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
#if JUCE_MAC || JUCE_LINUX

    void crashSignalHandler(int sig)
    {
        const char* signalName = "Unknown";

        switch (sig)
        {
            case SIGSEGV: signalName = "SIGSEGV (Segmentation fault)"; break;
            case SIGABRT: signalName = "SIGABRT (Abort)"; break;
            case SIGFPE:  signalName = "SIGFPE (Floating point exception)"; break;
            case SIGILL:  signalName = "SIGILL (Illegal instruction)"; break;
           #if defined(SIGBUS)
            case SIGBUS:  signalName = "SIGBUS (Bus error)"; break;
           #endif
            default: break;
        }

        char buffer[256];
        int len = snprintf(buffer, sizeof(buffer),
                           "\n*** CRASH DETECTED ***\nSignal: %s\n",
                           signalName);

        write(STDERR_FILENO, buffer, static_cast<size_t>(len));

        GlobalErrorHandler::writeCrashReport(sig);

        ::signal(sig, SIG_DFL);
        ::raise(sig);
    }

#endif
}

void GlobalErrorHandler::setupCrashHandlers()
{
#if JUCE_MAC || JUCE_LINUX

    struct sigaction sa;
    sa.sa_handler = crashSignalHandler;
    sa.sa_flags = SA_RESTART;
    sigemptyset(&sa.sa_mask);

    sigaction(SIGSEGV, &sa, nullptr);
    sigaction(SIGABRT, &sa, nullptr);
    sigaction(SIGFPE, &sa, nullptr);
    sigaction(SIGILL, &sa, nullptr);

   #if defined(SIGBUS)
    sigaction(SIGBUS, &sa, nullptr);
   #endif

    DBG("Crash signal handlers installed (POSIX)");

#elif JUCE_WINDOWS

    // Optional: basic Windows fallback
    SetUnhandledExceptionFilter([](EXCEPTION_POINTERS* info) -> LONG
    {
        GlobalErrorHandler::writeCrashReport(
            static_cast<int>(info->ExceptionRecord->ExceptionCode));
        return EXCEPTION_EXECUTE_HANDLER;
    });

    DBG("Crash handler installed (Windows)");

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