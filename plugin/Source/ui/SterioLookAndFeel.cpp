#include "SterioLookAndFeel.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

SterioLookAndFeel::SterioLookAndFeel()
{
    setColour(juce::ScrollBar::thumbColourId, Colors::GREY);
    setColour(juce::ScrollBar::trackColourId, Colors::RUSTIC_PINK);

    setColour(juce::TextButton::buttonColourId, Colors::LIGHT_GREY);
    setColour(juce::TextButton::textColourOffId, Colors::BLACK);
    setColour(juce::TextButton::textColourOnId, Colors::BLACK);
}

juce::Font SterioLookAndFeel::getTextButtonFont(juce::TextButton& button, int buttonHeight)
{
    return juce::Font((float)buttonHeight * 0.5f, juce::Font::bold);
}
