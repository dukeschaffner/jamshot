#pragma once

#include <juce_events/juce_events.h>
#include "StemModels.h"

//==============================================================================
class PluginState : public juce::AsyncUpdater
{
public:
    PluginState();
    ~PluginState() override = default;

    //==============================================================================
    // Thread-safe updates
    void setCurrentTrack(const TrackInfo& track); // safe from any thread
    void clearCurrentTrack();                      // safe from any thread

    //==============================================================================
    juce::Optional<TrackInfo> getCurrentTrack() const; // safe for any thread

    //==============================================================================
    // Add your listeners to get notified when the track changes
    void addChangeListener(juce::ChangeListener* listener);
    void removeChangeListener(juce::ChangeListener* listener);

private:
    //==============================================================================
    // AsyncUpdater callback — runs on the message thread
    void handleAsyncUpdate() override;

    std::shared_ptr<juce::Optional<TrackInfo>> currentTrack;
    juce::ListenerList<juce::ChangeListener> listeners;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginState)
};