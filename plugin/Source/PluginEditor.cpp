#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
SterioPluginEditor::SterioPluginEditor(SterioPluginProcessor& p, AuthManager& authManager)
    : AudioProcessorEditor(&p)
    , processorRef(p)
    , authManagerRef(authManager)
    , loginView(authManager)
{
    setSize(400, 280);

    addAndMakeVisible(loginView);

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

    // Auth status (Increment 2)
    juce::String authStatus = authManagerRef.isLoggedIn() ? "Logged in" : "Not logged in";
    g.setFont(12.0f);
    g.setColour(juce::Colours::lightgrey);
    g.drawText(authStatus, getLocalBounds().removeFromTop(60).withTrimmedTop(40), juce::Justification::centred, true);

    // Transport status
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

    g.setColour(juce::Colours::white);
    g.setFont(14.0f);
    g.drawText(status, getLocalBounds().withTrimmedTop(60), juce::Justification::centred, true);
}

void SterioPluginEditor::resized()
{
    auto r = getLocalBounds().reduced(10);

    // Login view
    auto loginRow = r.removeFromTop(50).withTrimmedTop(10);
    loginView.setBounds(loginRow);
}
