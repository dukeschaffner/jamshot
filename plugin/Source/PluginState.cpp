#include "PluginState.h"

//==============================================================================
PluginState::PluginState()
{
    currentTrack = std::make_shared<juce::Optional<TrackInfo>>();
}

//==============================================================================
void PluginState::setCurrentTrack(const TrackInfo& track)
{
    auto newPtr = std::make_shared<juce::Optional<TrackInfo>>(track);
    std::atomic_store(&currentTrack, newPtr);

    triggerAsyncUpdate(); // schedules handleAsyncUpdate() on message thread
}

void PluginState::clearCurrentTrack()
{
    auto newPtr = std::make_shared<juce::Optional<TrackInfo>>();
    std::atomic_store(&currentTrack, newPtr);

    triggerAsyncUpdate(); // schedules handleAsyncUpdate() on message thread
}

//==============================================================================
juce::Optional<TrackInfo> PluginState::getCurrentTrack() const
{
    auto ptr = std::atomic_load(&currentTrack);
    if (ptr)
        return *ptr;

    return {};
}

//==============================================================================
void PluginState::handleAsyncUpdate()
{
    // Notify all listeners on the message thread
    listeners.call([](juce::ChangeListener& l) { l.changeListenerCallback(nullptr); });
}

//==============================================================================
void PluginState::addChangeListener(juce::ChangeListener* listener)
{
    listeners.add(listener);
}

void PluginState::removeChangeListener(juce::ChangeListener* listener)
{
    listeners.remove(listener);
}