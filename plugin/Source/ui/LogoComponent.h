#pragma once
#include <juce_gui_basics/juce_gui_basics.h>

class LogoComponent : public juce::Component
{
public:
    LogoComponent();

    void paint(juce::Graphics& g) override;

private:
    juce::Image logo;
};