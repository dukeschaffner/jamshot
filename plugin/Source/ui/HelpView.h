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
        instructionsEditor.setFont(juce::Font(14.0f));
        instructionsEditor.setColour(juce::TextEditor::backgroundColourId, Colors::WHITE);
        instructionsEditor.setColour(juce::TextEditor::textColourId, Colors::BLACK);
        instructionsEditor.setText("Instructions:\n"
                                   "- Insert the plugin on the master bus\n"
                                   "- Use 44.1 kHz project sample rate for best results\n"
                                   "- Log in with your Sterio account or click the \"...\" button on a track in the website and click \"Open in Plugin\"\n"
                                   "- Set the metronome and time signature in your DAW and start playback from the timeline start. the plugin will sync the selected track playback with the DAW timeline, allowing you to record a new track\n"
                                   "- When finished recording, bounce and export audio file as .wav for best results (time sync in Sterio DAW may be slightly off for non PCM audio formats). Then import your file to the Sterio website DAW and upload from there.\n"
                                   "- NOTE: You can sync edits made in the web DAW to the plugin by clicking the \"...\" button in the web DAW and selecting \"Sync edits to plugin\"");
        addAndMakeVisible(instructionsEditor);
    }

    void resized() override
    {
        juce::FlexBox flexBox;
        flexBox.flexDirection = juce::FlexBox::Direction::column;
        flexBox.items.add(juce::FlexItem(instructionsEditor).withFlex(1));
        flexBox.performLayout(getLocalBounds());
    }

private:
    juce::TextEditor instructionsEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(HelpView)
};