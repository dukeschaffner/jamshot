#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
SterioPluginEditor::SterioPluginEditor(SterioPluginProcessor& p)
    : AudioProcessorEditor(&p)
    , processorRef(p)
{
    setSize(400, 200);
    startTimerHz(30);
}

SterioPluginEditor::~SterioPluginEditor()
{
    stopTimer();
}

void SterioPluginEditor::timerCallback()
{
    repaint();
}

void SterioPluginEditor::paint(juce::Graphics& g)
{
    g.fillAll(getLookAndFeel().findColour(juce::ResizableWindow::backgroundColourId));

    g.setColour(juce::Colours::white);
    g.setFont(20.0f);
    g.drawText("Sterio", getLocalBounds().removeFromTop(40), juce::Justification::centred, true);

    auto state = processorRef.getTransportState();
    juce::String status;
    if (state.hasValidPosition)
    {
        status = state.isPlaying ? "Playing" : "Stopped";
        status += " | " + juce::String(state.timeInSeconds, 2) + " s";
        status += " | " + juce::String(state.bpm, 1) + " BPM";
    }
    else
    {
        status = "No transport info";
    }

    g.setFont(14.0f);
    g.drawText(status, getLocalBounds().withTrimmedTop(50), juce::Justification::centred, true);
}

void SterioPluginEditor::resized()
{
}
