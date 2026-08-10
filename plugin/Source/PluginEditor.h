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
#include "ui/DebugMessageModal.h"
#include "ui/MainContentComponent.h"
#include "ui/AppHeaderComponent.h"
#include "ui/SampleRateWarningBar.h"
#include "ui/Footer.h"
#include "ui/HelpView.h"
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
    void onTrackSelected(const TrackInfo& track);
    void updateSampleRateWarning();
    void toggleHelp();
    void showDebugConsole();

    SterioPluginProcessor& processorRef;
    Services& services;

    SterioLookAndFeel lookAndFeel;
    juce::TooltipWindow tooltipWindow { this, 400 };
    AppHeaderComponent appHeader;
    LoginView loginView;
    SampleRateWarningBar sampleRateWarning;
    MessageDisplay messageDisplay;
    MainContentComponent mainContentComponent;
    HelpView helpView;
    Footer footer;

    bool showHighSampleRateWarning = false;
    bool showingHelp = false;
    bool showingUpdateButton = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginEditor)
};
