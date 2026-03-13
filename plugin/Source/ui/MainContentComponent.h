#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Services.h"
#include "TrackListPanel.h"
#include <juce_events/juce_events.h> 

class MainContentComponent : public juce::Component, public juce::ChangeListener
{
public:
    MainContentComponent(Services& services);
    ~MainContentComponent() override;

    void resized() override;

    void changeListenerCallback(juce::ChangeBroadcaster* source) override;

    void updateView(); // called when auth state changes

    TrackListPanel trackListPanel;

private:
    AuthManager& authRef;

    juce::Label loginMessage;
};