#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

//==============================================================================
/** Viewport with less aggressive mouse-wheel scrolling than JUCE defaults. */
class SmoothViewport : public juce::Viewport
{
public:
    // Mild dampening vs JUCE defaults (step 16, full wheel delta).
    static constexpr float wheelScale = 0.75f;
    static constexpr int stepSize = 10;

    SmoothViewport()
    {
        setSingleStepSizes (stepSize, stepSize);
        setScrollBarThickness (8);
    }

    void mouseWheelMove (const juce::MouseEvent& e,
                         const juce::MouseWheelDetails& wheel) override
    {
        auto damped = wheel;
        damped.deltaX *= wheelScale;
        damped.deltaY *= wheelScale;
        juce::Viewport::mouseWheelMove (e, damped);
    }
};
