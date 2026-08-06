#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

//==============================================================================
/** Centered empty/loading/error status with optional spinner (list + project body). */
class ListStatusView : public juce::Component, private juce::Timer
{
public:
    enum class State
    {
        Idle,
        Loading,
        Empty,
        Error
    };

    ListStatusView()
    {
        addAndMakeVisible (label);
        label.setJustificationType (juce::Justification::centred);
        label.setColour (juce::Label::textColourId, Colors::TEXT_DISABLED);
        label.setFont (juce::Font (UiMetrics::fontListTitle, juce::Font::plain));
        setOpaque (false);
    }

    ~ListStatusView() override { stopTimer(); }

    void setState (State newState, const juce::String& text)
    {
        state = newState;
        label.setText (text, juce::dontSendNotification);
        label.setColour (juce::Label::textColourId,
                         state == State::Error ? Colors::ERROR_TEXT : Colors::TEXT_DISABLED);

        if (state == State::Loading)
            startTimerHz (30);
        else
            stopTimer();

        resized();
        repaint();
    }

    State getState() const { return state; }

    void paint (juce::Graphics& g) override
    {
        if (state != State::Loading)
            return;

        auto area = getLocalBounds().toFloat();
        const float size = 18.0f;
        auto spinner = juce::Rectangle<float> (0, 0, size, size)
                           .withCentre ({ area.getCentreX(),
                                          label.getBounds().getY() - 14.0f });

        juce::Path ring;
        ring.addCentredArc (spinner.getCentreX(), spinner.getCentreY(),
                            size * 0.5f, size * 0.5f,
                            0.0f, 0.0f, juce::MathConstants<float>::twoPi, true);

        g.setColour (Colors::SEAFOAM_LIGHT);
        g.strokePath (ring, juce::PathStrokeType (2.0f));

        juce::Path arc;
        arc.addCentredArc (spinner.getCentreX(), spinner.getCentreY(),
                           size * 0.5f, size * 0.5f,
                           spinAngle, 0.0f, juce::MathConstants<float>::halfPi, true);
        g.setColour (Colors::SEAFOAM_DARK);
        g.strokePath (arc, juce::PathStrokeType (2.0f, juce::PathStrokeType::curved,
                                                 juce::PathStrokeType::rounded));
    }

    void resized() override
    {
        auto bounds = getLocalBounds().reduced (UiMetrics::space6);
        if (state == State::Loading)
            bounds.removeFromTop (28);
        label.setBounds (bounds);
    }

private:
    void timerCallback() override
    {
        spinAngle += 0.25f;
        if (spinAngle > juce::MathConstants<float>::twoPi)
            spinAngle -= juce::MathConstants<float>::twoPi;
        repaint();
    }

    State state = State::Idle;
    juce::Label label;
    float spinAngle = 0.0f;
};
