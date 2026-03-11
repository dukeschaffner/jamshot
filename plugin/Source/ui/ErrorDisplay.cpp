#include "ErrorDisplay.h"

ErrorDisplay::ErrorDisplay()
{
    addAndMakeVisible(messageLabel);
    messageLabel.setColour(juce::Label::textColourId, juce::Colours::white);
    messageLabel.setJustificationType(juce::Justification::centredLeft);

    addAndMakeVisible(okButton);
    okButton.onClick = [this]() { setError({}); };

    setVisible(false);
}

ErrorDisplay::~ErrorDisplay() = default;

void ErrorDisplay::setError(const juce::String& msg)
{
    if (msg.isEmpty())
    {
        messageLabel.setText({}, juce::dontSendNotification);
        setVisible(false);
        if (auto* p = getParentComponent())
            p->resized();
    }
    else
    {
        messageLabel.setText(msg, juce::dontSendNotification);
        setVisible(true);
        if (auto* p = getParentComponent())
            p->resized();
        else
            repaint();
    }
}

void ErrorDisplay::paint(juce::Graphics& g)
{
    // Background with a noticeable error color
    g.fillAll(juce::Colours::darkred);
}

void ErrorDisplay::resized()
{
    auto bounds = getLocalBounds().reduced(8);
    auto buttonWidth = 60;
    okButton.setBounds(bounds.removeFromRight(buttonWidth));
    messageLabel.setBounds(bounds);
}
