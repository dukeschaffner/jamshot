#pragma once

#include "PluginProcessor.h"

//==============================================================================
class SterioPluginEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit SterioPluginEditor(SterioPluginProcessor& p);
    ~SterioPluginEditor() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

private:
    void timerCallback() override;

    SterioPluginProcessor& processorRef;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginEditor)
};
