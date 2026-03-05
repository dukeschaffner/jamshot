#pragma once

#include "PluginProcessor.h"
#include "ui/LoginView.h"
#include "ui/TrackListPanel.h"
#include "api/SterioApiClient.h"

//==============================================================================
class SterioPluginEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    SterioPluginEditor(SterioPluginProcessor& p, AuthManager& authManager);
    ~SterioPluginEditor() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

private:
    void timerCallback() override;

    /** Handle track selection from the track list panel. */
    void onTrackSelected(const TrackInfo& track);

    SterioPluginProcessor& processorRef;
    AuthManager& authManagerRef;

    SterioApiClient apiClient;
    LoginView loginView;
    TrackListPanel trackListPanel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginEditor)
};
