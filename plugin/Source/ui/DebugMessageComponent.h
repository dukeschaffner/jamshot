#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include "../utils/MessageStore.h"
#include "../Colors.h"

//==============================================================================
class DebugMessageComponent : public juce::Component,
                              private juce::Timer
{
public:
    DebugMessageComponent()
    {
        addAndMakeVisible(textBox);
        textBox.setMultiLine(true);
        textBox.setReadOnly(true);
        textBox.setScrollbarsShown(true);
        textBox.setCaretVisible(false);
        
        // Style the text box for visibility
        textBox.setColour(juce::TextEditor::backgroundColourId, Colors::LIGHT_GREY);
        textBox.setColour(juce::TextEditor::textColourId, Colors::BLACK);
        textBox.setColour(juce::TextEditor::outlineColourId, Colors::GREY);
        textBox.setColour(juce::TextEditor::focusedOutlineColourId, Colors::GREY);
        
        // Use monospace font for better readability of debug messages
        textBox.setFont(juce::Font(juce::Font::getDefaultMonospacedFontName(), 11.0f, juce::Font::plain));
        
        startTimerHz(10); // check for new messages 10 times/sec
    }

    void paint(juce::Graphics& g) override
    {
        // Draw a border around the component
        g.setColour(Colors::GREY);
        g.drawRect(getLocalBounds(), 1);
        g.fillAll(Colors::LIGHT_GREY);
    }

    void resized() override
    {
        textBox.setBounds(getLocalBounds());
    }

private:
    void timerCallback() override
    {
        auto newMessages = MessageStore::getInstance().getNewMessages();
        if (!newMessages->empty())
        {
            for (auto& msg : *newMessages)
            {
                juce::String prefix;
                switch (msg.severity)
                {
                    case PluginMessage::Severity::Info:    prefix = "[INFO] "; break;
                    case PluginMessage::Severity::Warning: prefix = "[WARN] "; break;
                    case PluginMessage::Severity::Error:   prefix = "[ERROR] "; break;
                    case PluginMessage::Severity::Critical:   prefix = "[CRITICAL] "; break;
                }
                textBox.moveCaretToEnd();
                textBox.insertTextAtCaret(prefix + msg.content + "\n");
            }
        }
    }

    juce::TextEditor textBox;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DebugMessageComponent)
};
