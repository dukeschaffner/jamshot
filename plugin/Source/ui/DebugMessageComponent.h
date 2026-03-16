#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include "DebugMessageModal.h"

//==============================================================================
class DebugMessageComponent : public juce::Component
{
public:
    DebugMessageComponent()
    {
        addAndMakeVisible(debugButton);
        debugButton.setButtonText("Show Debug");

        debugButton.onClick = [this]
        {
            showDebugWindow();
        };
    }

    void resized() override
    {
        debugButton.setBounds(getLocalBounds());
    }

private:

    void showDebugWindow()
    {
        auto* modal = new DebugMessageModal();

        juce::DialogWindow::LaunchOptions options;
        options.content.setOwned(modal);
        options.dialogTitle = "Debug Console";
        options.dialogBackgroundColour = juce::Colours::darkgrey;
        options.escapeKeyTriggersCloseButton = true;
        options.useNativeTitleBar = true;
        options.resizable = true;

        options.content->setSize(600, 400);

        options.launchAsync();
    }

    juce::TextButton debugButton;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DebugMessageComponent)
};