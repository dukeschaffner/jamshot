#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include <map>
#include <vector>
#include "../../PluginProcessor.h"
#include "../../Colors.h"

//==============================================================================
/** Read-only project timeline with track lanes, clip waveforms, and DAW-synced playhead. */
class ProjectTimelineView : public juce::Component, private juce::Timer
{
public:
    explicit ProjectTimelineView(SterioPluginProcessor& processor);
    ~ProjectTimelineView() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    /** Reload timeline from processor's loaded project clips/tracks/stems. */
    void refreshFromProcessor();

    void setProjectDuration(double durationSeconds);

private:
    static constexpr int kLabelWidth = 80;
    static constexpr int kLaneHeight = 48;
    static constexpr int kLaneGap = 2;
    static constexpr double kDefaultSampleRate = 44100.0;

    struct ClipVisual
    {
        int clipId = 0;
        int trackId = 0;
        double startTime = 0.0;
        double endTime = 0.0;
        double trimStart = 0.0;
        std::shared_ptr<juce::AudioBuffer<float>> audioBuffer;
        std::vector<float> peaks; // interleaved min/max pairs, normalized -1..1
        bool peaksReady = false;
    };

    struct TrackLane
    {
        ProjectTrackInfo info;
        juce::Array<ClipVisual> clips;
    };

    class TimelineContent : public juce::Component
    {
    public:
        TimelineContent(ProjectTimelineView& owner) : ownerView(owner) {}
        void paint(juce::Graphics& g) override { ownerView.paintContent(g); }

    private:
        ProjectTimelineView& ownerView;
    };

    class PlayheadOverlay : public juce::Component
    {
    public:
        void paint(juce::Graphics& g) override
        {
            g.setColour(Colors::RUSTIC_PINK);
            g.fillRect(0, 0, 2, getHeight());
        }
    };

    void timerCallback() override;
    void paintContent(juce::Graphics& g);
    void updatePlayheadPosition();
    void computePeaksAsync(int clipId, std::shared_ptr<juce::AudioBuffer<float>> buffer,
                           double trimStart, double trimEnd, double sampleRate);
    void applyPeaks(int clipId, std::vector<float> peaks);
    float secondsToX(double seconds, int timelineWidth) const;
    juce::Colour laneColour(int index) const;

    SterioPluginProcessor& processorRef;
    juce::Array<TrackLane> lanes;
    double projectDurationSeconds = 60.0;
    double playheadSeconds = 0.0;

    juce::Viewport viewport;
    TimelineContent content;
    PlayheadOverlay playhead;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProjectTimelineView)
};
