#include "SterioLookAndFeel.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

SterioLookAndFeel::SterioLookAndFeel()
{
    setColour(juce::ScrollBar::thumbColourId, Colors::GREY);
    setColour(juce::ScrollBar::trackColourId, Colors::RUSTIC_PINK);
}
