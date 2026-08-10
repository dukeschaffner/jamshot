#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include <vector>
#include "../../PluginProcessor.h"
#include "../../Colors.h"
#include "../SmoothViewport.h"
#include "StemTimelineModels.h"

//==============================================================================
/** Shared timeline: lanes, clip waveforms, DAW-synced playhead, and M/S. */
class StemTimelineView : public juce::Component, private juce::Timer
{
public:
    explicit StemTimelineView(SterioPluginProcessor& processor);
    ~StemTimelineView() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void setDurationSeconds(double durationSeconds);
    void setLanes(juce::Array<TimelineLane> nextLanes);

private:
    static constexpr int kLabelWidth = UiMetrics::timelineLabelW;
    static constexpr int kLaneHeight = UiMetrics::timelineLaneH;
    static constexpr int kLaneGap = UiMetrics::timelineLaneGap;
    static constexpr int kMixButtonH = 20;
    static constexpr double kDefaultSampleRate = 44100.0;

    class TimelineContent : public juce::Component
    {
    public:
        TimelineContent(StemTimelineView& owner) : ownerView(owner) {}
        void paint(juce::Graphics& g) override { ownerView.paintContent(g); }
        void mouseDown(const juce::MouseEvent& event) override
        {
            ownerView.handleContentMouseDown(event);
        }

    private:
        StemTimelineView& ownerView;
    };

    class PlayheadOverlay : public juce::Component
    {
    public:
        void paint(juce::Graphics& g) override
        {
            g.setColour(Colors::S2);
            g.fillRect(0, 0, 2, getHeight());
            juce::Path tip;
            tip.addTriangle(-4.0f, 0.0f, 6.0f, 0.0f, 1.0f, 6.0f);
            g.fillPath(tip);
        }
    };

    void timerCallback() override;
    void paintContent(juce::Graphics& g);
    void handleContentMouseDown(const juce::MouseEvent& event);
    juce::Rectangle<int> muteButtonBounds(int laneIndex) const;
    juce::Rectangle<int> soloButtonBounds(int laneIndex) const;
    void updatePlayheadPosition();
    void computePeaksAsync(int clipId, std::shared_ptr<juce::AudioBuffer<float>> buffer,
                           double trimStart, double trimEnd, double sampleRate);
    void applyPeaks(int clipId, std::vector<float> peaks);
    float secondsToX(double seconds, int timelineWidth) const;
    juce::Colour laneColour(int index) const;

    SterioPluginProcessor& processorRef;
    juce::Array<TimelineLane> lanes;
    double durationSeconds = 60.0;
    double playheadSeconds = 0.0;

    SmoothViewport viewport;
    TimelineContent content;
    PlayheadOverlay playhead;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(StemTimelineView)
};
