#pragma once
#include <juce_gui_basics/juce_gui_basics.h>

class SterioLookAndFeel : public juce::LookAndFeel_V4
{
public:
    SterioLookAndFeel();

    juce::Font getTextButtonFont(juce::TextButton& button, int buttonHeight) override;
};
