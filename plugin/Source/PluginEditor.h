#pragma once

#include "PluginProcessor.h"
#include "ui/LoginView.h"

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

    SterioPluginProcessor& processorRef;
    AuthManager& authManagerRef;

    LoginView loginView;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginEditor)
};
