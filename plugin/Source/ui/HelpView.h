#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

//==============================================================================
class HelpView : public juce::Component
{
public:
    HelpView()
    {
        instructionsEditor.setMultiLine(true);
        instructionsEditor.setReadOnly(true);
        instructionsEditor.setScrollbarsShown(true);
        instructionsEditor.setFont(juce::Font(UiMetrics::fontHelpBody, juce::Font::plain));
        instructionsEditor.setColour(juce::TextEditor::backgroundColourId, Colors::BACKGROUND);
        instructionsEditor.setColour(juce::TextEditor::textColourId, Colors::TEXT_SECONDARY);
        instructionsEditor.setColour(juce::TextEditor::outlineColourId, juce::Colours::transparentBlack);
        instructionsEditor.setColour(juce::TextEditor::focusedOutlineColourId, juce::Colours::transparentBlack);
        instructionsEditor.setColour(juce::CaretComponent::caretColourId, juce::Colours::transparentBlack);
        instructionsEditor.setText(
            "1. Prefer a 44.1 kHz host/project sample rate for best results.\n\n"
            "2. Log in with your Sterio account, or open a track from the website via "
            "\"Open in Plugin\".\n\n"
            "3. Set the metronome and time signature in your DAW, then start playback from "
            "the timeline start so the plugin can sync.\n\n"
            "4. When finished recording, bounce/export as WAV, then import and upload in the "
            "Sterio web DAW.\n\n"
            "5. Sync web DAW edits back to the plugin with \"Sync edits to plugin\" in the web DAW.");
        addAndMakeVisible(instructionsEditor);
        setOpaque(true);
    }

    void paint(juce::Graphics& g) override
    {
        g.fillAll(Colors::BACKGROUND);

        auto bounds = getLocalBounds().withTrimmedLeft(18).withTrimmedRight(18).withTrimmedTop(14);
        auto titleRow = bounds.removeFromTop(20);
        g.setFont(juce::Font(UiMetrics::fontHelpTitle, juce::Font::bold));
        g.setColour(Colors::TEXT_PRIMARY);
        g.drawText("Help", titleRow, juce::Justification::centredLeft, true);

        juce::ColourGradient grad(Colors::SEAFOAM, (float) titleRow.getX(), 0.0f,
                                  Colors::RUSTIC_PINK, (float) titleRow.getX() + 42.0f, 0.0f, false);
        g.setGradientFill(grad);
        g.fillRoundedRectangle((float) titleRow.getX(), (float) titleRow.getBottom() + 4.0f,
                               42.0f, 3.0f, 2.0f);
    }

    void resized() override
    {
        auto bounds = getLocalBounds();
        bounds.removeFromTop(44);
        instructionsEditor.setBounds(bounds.withTrimmedLeft(18).withTrimmedRight(18)
                                           .withTrimmedBottom(18));
    }

private:
    juce::TextEditor instructionsEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(HelpView)
};
