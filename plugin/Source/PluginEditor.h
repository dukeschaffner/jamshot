#pragma once

#include "PluginProcessor.h"
#include "ui/LoginView.h"
#include "ui/SterioLookAndFeel.h"
#include "api/SterioApiClient.h"
#include "api/TrackLoader.h"
#include "StemModels.h"
#include "CacheManager.h"
#include "ui/MessageDisplay.h"
#include "ui/DebugMessageComponent.h"
#include "ui/MainContentComponent.h"
#include "ui/LogoComponent.h"
#include "ui/Footer.h"
#include "Services.h"

//==============================================================================
class SterioPluginEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    SterioPluginEditor(SterioPluginProcessor& p);
    ~SterioPluginEditor() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

private:
    void timerCallback() override;

    /** Handle track selection from the track list panel. */
    void onTrackSelected(const TrackInfo& track);

    /** Check if we should show high sample rate warning */
    void updateSampleRateWarning();

    SterioPluginProcessor& processorRef;
    Services& services;
    LoginView loginView;
    MessageDisplay messageDisplay;
    MainContentComponent mainContentComponent;
    SterioLookAndFeel lookAndFeel;
    DebugMessageComponent debugComponent;
    juce::TextButton debugToggleButton;
    LogoComponent logoComponent;
    Footer footer;

    /** Flag to show high sample rate warning */
    bool showHighSampleRateWarning = false;
    
    /** Flag to track debug component visibility */
    bool debugComponentVisible = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginEditor)
};
