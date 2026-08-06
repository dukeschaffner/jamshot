#pragma once
#include <juce_gui_basics/juce_gui_basics.h>

class SterioLookAndFeel : public juce::LookAndFeel_V4
{
public:
    SterioLookAndFeel();

    juce::Font getTextButtonFont (juce::TextButton& button, int buttonHeight) override;

    void drawButtonBackground (juce::Graphics& g,
                               juce::Button& button,
                               const juce::Colour& backgroundColour,
                               bool shouldDrawButtonAsHighlighted,
                               bool shouldDrawButtonAsDown) override;

    void drawButtonText (juce::Graphics& g,
                         juce::TextButton& button,
                         bool shouldDrawButtonAsHighlighted,
                         bool shouldDrawButtonAsDown) override;

    void drawScrollbar (juce::Graphics& g,
                        juce::ScrollBar& scrollbar,
                        int x, int y, int width, int height,
                        bool isScrollbarVertical,
                        int thumbStartPosition,
                        int thumbSize,
                        bool isMouseOver,
                        bool isMouseDown) override;

    int getDefaultScrollbarWidth() override;

private:
    void drawPillButton (juce::Graphics& g,
                         juce::Button& button,
                         bool highlighted,
                         bool down,
                         const juce::String& style);

    void drawTabButton (juce::Graphics& g,
                        juce::Button& button,
                        bool highlighted,
                        bool active);
};
