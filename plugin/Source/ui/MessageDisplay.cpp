#include "MessageDisplay.h"
#include "../utils/MessageStore.h"

MessageDisplay::MessageDisplay()
{
    addAndMakeVisible(messageLabel);
    messageLabel.setColour(juce::Label::textColourId, juce::Colours::white);
    messageLabel.setJustificationType(juce::Justification::centredLeft);

    addAndMakeVisible(okButton);
    okButton.onClick = [this]() { clearMessage(); };

    startTimerHz(5); // poll for messages
    setVisible(false);
}

MessageDisplay::~MessageDisplay() = default;

void MessageDisplay::timerCallback()
{
    auto messages = MessageStore::getInstance().getNewMessages();

    if (!messages || messages->empty())
    {
        juce::String currentMessage = messageLabel.getText();
        if (currentMessage.isEmpty())
        {
            setVisible(false);
        }
        return;
    }

    for (auto& msg : *messages)
    {
        if (msg.severity == PluginMessage::Severity::Error ||
            msg.severity == PluginMessage::Severity::Warning ||
            msg.severity == PluginMessage::Severity::Critical ||
            msg.severity == PluginMessage::Severity::Info)
        {
            messageLabel.setText(msg.content, juce::dontSendNotification);
            currentSeverity = static_cast<int>(msg.severity);
            
            // Set text color based on severity
            if (msg.severity == PluginMessage::Severity::Info)
            {
                messageLabel.setColour(juce::Label::textColourId, juce::Colours::black);
            }
            else if (msg.severity == PluginMessage::Severity::Warning)
            {
                messageLabel.setColour(juce::Label::textColourId, juce::Colours::black);
            }
            else // Error or Critical
            {
                messageLabel.setColour(juce::Label::textColourId, juce::Colours::white);
            }
            
            setVisible(true);

            if (auto* p = getParentComponent())
                p->resized();

            break; // show first message
        }
    }
}

void MessageDisplay::clearMessage()
{
    messageLabel.setText({}, juce::dontSendNotification);
    currentSeverity = -1;
    setVisible(false);

    if (auto* p = getParentComponent())
        p->resized();
}

void MessageDisplay::paint(juce::Graphics& g)
{
    juce::String message = messageLabel.getText();
    // Background color based on severity
    juce::Colour bgColour = juce::Colours::darkgrey; // default
    
    switch (currentSeverity)
    {
        case static_cast<int>(PluginMessage::Severity::Info):
            bgColour = juce::Colour(0xFF1E90FF); // Dodger blue
            break;
        case static_cast<int>(PluginMessage::Severity::Warning):
            bgColour = juce::Colour(0xFFFFB347); // Pastel orange
            break;
        case static_cast<int>(PluginMessage::Severity::Error):
            bgColour = juce::Colours::darkred;
            break;
        case static_cast<int>(PluginMessage::Severity::Critical):
            bgColour = juce::Colour(0xFF8B0000); // Dark red
            break;
        default:
            bgColour = juce::Colours::darkgrey;
    }
    
    g.fillAll(bgColour);
}

void MessageDisplay::resized()
{
    auto bounds = getLocalBounds().reduced(8);
    auto buttonWidth = 60;
    okButton.setBounds(bounds.removeFromRight(buttonWidth));
    messageLabel.setBounds(bounds);
}
