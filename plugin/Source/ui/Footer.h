#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Services.h"
#include <juce_events/juce_events.h> 

class Footer : public juce::Component, public juce::ChangeListener
{
public:
    Footer(Services& services);
    ~Footer() override;

    void resized() override;
    void paint(juce::Graphics& g) override;

    void changeListenerCallback(juce::ChangeBroadcaster* source) override;

private:
    PluginState& pluginStateRef;

    juce::Label trackNameLabel;
    juce::Label artistLabel;
    juce::Label detailsLabel;
    juce::Label messageLabel;

};