#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

class LogoComponent : public juce::Component
{
public:
    LogoComponent();

    void paint(juce::Graphics& g) override;

    int getPreferredWidth() const
    {
        if (!logo.isValid())
            return 80;

        const float aspect = (float) logo.getWidth() / (float) juce::jmax(1, logo.getHeight());
        return juce::roundToInt((float) UiMetrics::logoH * aspect);
    }

private:
    juce::Image logo;
};
