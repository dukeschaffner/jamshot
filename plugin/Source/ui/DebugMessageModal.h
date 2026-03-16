#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include "../utils/MessageStore.h"
#include "../Colors.h"

//==============================================================================
class DebugMessageModal : public juce::Component,
                          private juce::Timer
{
public:
    DebugMessageModal()
    {
        addAndMakeVisible(textBox);

        textBox.setMultiLine(true);
        textBox.setReadOnly(true);
        textBox.setScrollbarsShown(true);
        textBox.setCaretVisible(false);

        textBox.setColour(juce::TextEditor::backgroundColourId, Colors::LIGHT_GREY);
        textBox.setColour(juce::TextEditor::textColourId, Colors::BLACK);
        textBox.setColour(juce::TextEditor::outlineColourId, Colors::GREY);

        textBox.setFont(juce::Font(
            juce::Font::getDefaultMonospacedFontName(),
            11.0f,
            juce::Font::plain));

        processMessages(MessageStore::getInstance().getAllMessages());

        startTimerHz(10);
    }

    void resized() override
    {
        textBox.setBounds(getLocalBounds());
    }

private:
    void processMessages(std::shared_ptr<std::vector<PluginMessage>> messages)
    {
        if (!messages->empty())
        {
            for (auto& msg : *messages)
            {
                juce::String prefix;

                switch (msg.severity)
                {
                    case PluginMessage::Severity::Info: prefix = "[INFO] "; break;
                    case PluginMessage::Severity::Warning: prefix = "[WARN] "; break;
                    case PluginMessage::Severity::Error: prefix = "[ERROR] "; break;
                    case PluginMessage::Severity::Critical: prefix = "[CRITICAL] "; break;
                }

                textBox.moveCaretToEnd();
                textBox.insertTextAtCaret(prefix + msg.content + "\n");
            }
        }
    }


    void timerCallback() override
    {
        auto newMessages = MessageStore::getInstance().getNewMessages();
        processMessages(newMessages);
    }

    juce::TextEditor textBox;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DebugMessageModal)
};