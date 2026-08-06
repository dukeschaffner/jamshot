#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Services.h"
#include "StatusIndicator.h"
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
    enum class Mode { Prompt, Fetching, Track, Project };

    PluginState& pluginStateRef;
    Mode mode = Mode::Prompt;

    StatusIndicator statusDot;
    juce::Label primaryLabel;
    juce::Label secondaryLabel;
    juce::Label messageLabel;
};
