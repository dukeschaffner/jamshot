#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

//==============================================================================
/** Section title + Refresh pill (Liked Tracks / Projects list chrome). */
class SectionHeaderBar : public juce::Component
{
public:
    SectionHeaderBar (const juce::String& titleText)
        : title (titleText),
          refreshButton (juce::String (juce::CharPointer_UTF8 ("\xe2\x86\xbb Refresh")))
    {
        addAndMakeVisible (refreshButton);
        SterioButtonStyle::apply (refreshButton, SterioButtonStyle::standard);
    }

    void setTitle (const juce::String& titleText) { title = titleText; repaint(); }

    void setOnRefresh (std::function<void()> cb)
    {
        refreshButton.onClick = std::move (cb);
    }

    void paint (juce::Graphics& g) override
    {
        g.fillAll (Colors::BACKGROUND);

        auto bounds = getLocalBounds();
        bounds.removeFromTop (10);
        bounds.removeFromBottom (6);
        bounds.removeFromLeft (UiMetrics::contentPadX);
        bounds.removeFromRight (UiMetrics::contentPadX + 78 + UiMetrics::space3);

        g.setFont (juce::Font (UiMetrics::fontSection, juce::Font::bold));
        g.setColour (Colors::TEXT_SECONDARY);
        g.drawText (title.toUpperCase(), bounds, juce::Justification::centredLeft, true);
    }

    void resized() override
    {
        auto bounds = getLocalBounds();
        bounds.removeFromTop (10);
        bounds.removeFromBottom (6);
        bounds.removeFromRight (UiMetrics::contentPadX);

        refreshButton.setBounds (bounds.removeFromRight (78).withHeight (22)
                                       .withY (bounds.getY() + juce::jmax (0, (bounds.getHeight() - 22) / 2)));
    }

private:
    juce::String title;
    juce::TextButton refreshButton;
};
