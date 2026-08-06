#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

//==============================================================================
/** Centered brand-gradient card shown when logged out. */
class LoginPromptCard : public juce::Component
{
public:
    LoginPromptCard()
    {
        setOpaque (false);
        message = "Log in to view liked tracks and projects";
    }

    void setMessage (const juce::String& text) { message = text; repaint(); }

    void paint (juce::Graphics& g) override
    {
        auto area = getLocalBounds().toFloat().reduced ((float) UiMetrics::space5);
        const float maxW = 260.0f;
        auto card = juce::Rectangle<float> (0, 0, juce::jmin (maxW, area.getWidth()), 90.0f)
                        .withCentre (area.getCentre());

        juce::ColourGradient grad (Colors::SEAFOAM_LIGHT, card.getX(), card.getY(),
                                   Colors::RUSTIC_PINK_LIGHT, card.getRight(), card.getBottom(), false);
        g.setGradientFill (grad);
        g.fillRoundedRectangle (card, UiMetrics::radiusLg);

        g.setColour (juce::Colours::black.withAlpha (0.06f));
        g.drawRoundedRectangle (card.translated (0.0f, 1.0f), UiMetrics::radiusLg, 1.0f);

        g.setFont (juce::Font (UiMetrics::fontListTitle, juce::Font::bold));
        g.setColour (Colors::GREY_4);
        g.drawFittedText (message, card.reduced (22.0f, 18.0f).toNearestInt(),
                          juce::Justification::centred, 3);
    }

private:
    juce::String message;
};
