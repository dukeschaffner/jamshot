#pragma once

#include <juce_events/juce_events.h>
#include <juce_core/juce_core.h>

/**
 * Derives the header connection/sync badge state from web-client presence
 * and the web DAW's reported sync intent.
 */
class WebDawConnectionIndicatorModel : public juce::ChangeBroadcaster
{
public:
    enum class Mode
    {
        NotConnected,
        Connected,
        Syncing
    };

    Mode getMode() const
    {
        const juce::ScopedLock lock(stateLock);
        return mode;
    }

    juce::String getLabel() const
    {
        switch (getMode())
        {
            case Mode::Syncing:      return "Syncing";
            case Mode::Connected:    return "Connected";
            case Mode::NotConnected:
            default:                 return "Offline";
        }
    }

    juce::String getDetail() const
    {
        const juce::ScopedLock lock(stateLock);
        switch (mode)
        {
            case Mode::Syncing:
                return "Auto-sync is active. Edits in the web DAW will sync to this plugin.";
            case Mode::Connected:
                return "Web DAW is connected, but not syncing with this view. Open the same project in the browser with auto-sync enabled.";
            case Mode::NotConnected:
            default:
                if (serverErrorReason.isNotEmpty())
                    return "Browser sync unavailable. " + serverErrorReason;
                return "Web DAW is not connected. Open Sterio in your browser to sync.";
        }
    }

    void setServerListening(bool listening)
    {
        bool changed = false;
        {
            const juce::ScopedLock lock(stateLock);
            serverListening = listening;
            if (listening)
                serverErrorReason.clear();
            if (!listening)
                webReportsSyncing = false;
            changed = updateModeUnlocked();
        }
        if (changed)
            notifyAsync();
    }

    void setServerError(const juce::String& reason)
    {
        bool changed = false;
        {
            const juce::ScopedLock lock(stateLock);
            serverListening = false;
            webClientConnected = false;
            webReportsSyncing = false;
            serverErrorReason = reason;
            changed = updateModeUnlocked();
        }
        if (changed)
            notifyAsync();
    }

    void setWebClientConnected(bool connected)
    {
        bool changed = false;
        {
            const juce::ScopedLock lock(stateLock);
            webClientConnected = connected;
            if (!connected)
                webReportsSyncing = false;
            changed = updateModeUnlocked();
        }
        if (changed)
            notifyAsync();
    }

    void setWebReportsSyncing(bool syncing)
    {
        bool changed = false;
        {
            const juce::ScopedLock lock(stateLock);
            webReportsSyncing = syncing;
            changed = updateModeUnlocked();
        }
        if (changed)
            notifyAsync();
    }

private:
    bool updateModeUnlocked()
    {
        Mode next = Mode::NotConnected;
        if (serverListening && webClientConnected)
            next = webReportsSyncing ? Mode::Syncing : Mode::Connected;

        if (next == mode)
            return false;

        mode = next;
        return true;
    }

    void notifyAsync()
    {
        juce::MessageManager::callAsync([safe = juce::WeakReference<WebDawConnectionIndicatorModel>(this)]()
        {
            if (safe != nullptr)
                safe->sendChangeMessage();
        });
    }

    mutable juce::CriticalSection stateLock;
    bool serverListening = false;
    bool webClientConnected = false;
    bool webReportsSyncing = false;
    juce::String serverErrorReason;
    Mode mode = Mode::NotConnected;

    JUCE_DECLARE_WEAK_REFERENCEABLE(WebDawConnectionIndicatorModel)
};
