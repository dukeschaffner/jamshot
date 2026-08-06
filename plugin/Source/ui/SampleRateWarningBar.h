#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

//==============================================================================
/** Host sample-rate warning strip matching the themed artifact. */
class SampleRateWarningBar : public juce::Component
{
public:
    SampleRateWarningBar()
    {
        addAndMakeVisible (label);
        label.setText ("Warning: Host sample rate > 100kHz not supported. Stems will not be converted.",
                       juce::dontSendNotification);
        label.setColour (juce::Label::textColourId, Colors::WARN_TEXT);
        label.setFont (juce::Font (UiMetrics::fontBanner, juce::Font::bold));
        label.setJustificationType (juce::Justification::centredLeft);
        setOpaque (true);
    }

    void paint (juce::Graphics& g) override
    {
        g.fillAll (Colors::SAMPLE_RATE_WARN_BG);
        g.setColour (Colors::RUSTIC_PINK);
        g.fillRect (0, 0, 3, getHeight());
        g.setColour (Colors::GREY_2);
        g.fillRect (0, getHeight() - 1, getWidth(), 1);
    }

    void resized() override
    {
        label.setBounds (getLocalBounds().withTrimmedLeft (12).withTrimmedRight (14)
                             .withTrimmedTop (8).withTrimmedBottom (8));
    }

    int getPreferredHeight() const { return 40; }

private:
    juce::Label label;
};
