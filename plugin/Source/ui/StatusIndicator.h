#pragma once

#include <cmath>
#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

//==============================================================================
/** Small status dot with optional pulse animation (auth strip / footer). */
class StatusIndicator : public juce::Component, private juce::Timer
{
public:
    enum class Mode
    {
        Hidden,
        Neutral,
        Success,
        Loading,
        Error,
        Fetching
    };

    StatusIndicator()
    {
        setInterceptsMouseClicks (false, false);
        setOpaque (false);
    }

    ~StatusIndicator() override { stopTimer(); }

    void setMode (Mode newMode)
    {
        if (mode == newMode)
            return;

        mode = newMode;
        pulsePhase = 0.0f;

        if (mode == Mode::Loading || mode == Mode::Fetching)
            startTimerHz (30);
        else
            stopTimer();

        setVisible (mode != Mode::Hidden);
        repaint();
    }

    Mode getMode() const { return mode; }

    void paint (juce::Graphics& g) override
    {
        if (mode == Mode::Hidden)
            return;

        auto bounds = getLocalBounds().toFloat();
        const float size = (float) juce::jmin (getWidth(), getHeight());
        auto dot = bounds.withSizeKeepingCentre (size, size);

        juce::Colour c = Colors::GREY_2;
        float alpha = 1.0f;

        switch (mode)
        {
            case Mode::Success:  c = Colors::DARK_GREEN; break;
            case Mode::Loading:  c = Colors::SEAFOAM_DARK; alpha = pulseAlpha(); break;
            case Mode::Error:    c = Colors::RED; break;
            case Mode::Fetching: c = Colors::RUSTIC_PINK; alpha = pulseAlpha(); break;
            case Mode::Neutral:
            case Mode::Hidden:
            default: break;
        }

        g.setColour (c.withMultipliedAlpha (alpha));
        g.fillEllipse (dot);
    }

private:
    void timerCallback() override
    {
        pulsePhase += 0.08f;
        if (pulsePhase > juce::MathConstants<float>::twoPi)
            pulsePhase -= juce::MathConstants<float>::twoPi;
        repaint();
    }

    float pulseAlpha() const
    {
        // 0.3 .. 1.0 matching CSS pulse-dot
        return 0.3f + 0.7f * (0.5f + 0.5f * std::cos (pulsePhase));
    }

    Mode mode = Mode::Hidden;
    float pulsePhase = 0.0f;
};
