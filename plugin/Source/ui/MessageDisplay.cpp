#include "MessageDisplay.h"
#include "../utils/MessageStore.h"
#include "../Colors.h"

MessageDisplay::MessageDisplay()
{
    addAndMakeVisible(messageLabel);
    messageLabel.setColour(juce::Label::textColourId, Colors::TEXT_PRIMARY);
    messageLabel.setFont(juce::Font(UiMetrics::fontBanner, juce::Font::bold));
    messageLabel.setJustificationType(juce::Justification::centredLeft);

    addAndMakeVisible(okButton);
    okButton.setButtonText("OK");
    SterioButtonStyle::apply(okButton, SterioButtonStyle::standard);
    okButton.onClick = [this]() { clearMessage(); };

    startTimerHz(5);
    setVisible(false);
    setOpaque(true);
}

MessageDisplay::~MessageDisplay() = default;

void MessageDisplay::timerCallback()
{
    auto messages = MessageStore::getInstance().getNewMessages();

    if (!messages || messages->empty())
    {
        juce::String currentMessage = messageLabel.getText();
        if (currentMessage.isEmpty())
            setVisible(false);
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
            messageLabel.setColour(juce::Label::textColourId, Colors::TEXT_PRIMARY);

            setVisible(true);

            if (auto* p = getParentComponent())
                p->resized();

            break;
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
    juce::Colour accent = Colors::RED;
    juce::Colour bg = Colors::BANNER_BG;

    switch (currentSeverity)
    {
        case static_cast<int>(PluginMessage::Severity::Info):
            accent = Colors::SEAFOAM_DARK;
            bg = Colors::SEAFOAM_LIGHT;
            break;
        case static_cast<int>(PluginMessage::Severity::Warning):
            accent = Colors::RUSTIC_PINK;
            bg = Colors::RUSTIC_PINK_LIGHT;
            break;
        case static_cast<int>(PluginMessage::Severity::Error):
        case static_cast<int>(PluginMessage::Severity::Critical):
            accent = Colors::RED;
            bg = Colors::BANNER_BG;
            break;
        default:
            break;
    }

    g.fillAll(bg);
    g.setColour(accent);
    g.fillRect(0, 0, 3, getHeight());
    g.setColour(Colors::GREY_2);
    g.fillRect(0, getHeight() - 1, getWidth(), 1);
}

void MessageDisplay::resized()
{
    auto bounds = getLocalBounds().withTrimmedLeft(12).withTrimmedRight(14)
                      .withTrimmedTop(8).withTrimmedBottom(8);

    const int btnW = 44;
    const int btnH = 22;
    okButton.setBounds(bounds.removeFromRight(btnW).withSizeKeepingCentre(btnW, btnH));
    bounds.removeFromRight(UiMetrics::space3);
    messageLabel.setBounds(bounds);
}
