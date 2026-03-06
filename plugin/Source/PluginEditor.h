#pragma once

#include "PluginProcessor.h"
#include "ui/LoginView.h"
#include "ui/TrackListPanel.h"
#include "api/SterioApiClient.h"
#include "api/TrackLoader.h"

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

    /** Handle successful stem loading. */
    void onStemsLoaded(const juce::Array<StemTrack>& stems);

    /** Handle stem loading errors. */
    void onStemsLoadError(const TrackInfo& track, const juce::String& errorMessage);

    SterioPluginProcessor& processorRef;
    AuthManager& authManagerRef;

    SterioApiClient apiClient;
    TrackLoader trackLoader;
    LoginView loginView;
    TrackListPanel trackListPanel;

    /** Currently loaded stems for the selected track. */
    juce::Array<StemTrack> loadedStems;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginEditor)
};
