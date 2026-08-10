#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include "../../PluginProcessor.h"
#include "../../Services.h"
#include "../../Colors.h"
#include "../ListStatusView.h"
#include "../timeline/StemTimelineView.h"

//==============================================================================
/** Track detail: floating back, status or timeline (title/BPM live in footer). */
class TrackView : public juce::Component, private juce::ChangeListener
{
public:
    using BackCallback = std::function<void()>;

    TrackView(SterioPluginProcessor& processor, Services& services);
    ~TrackView() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void setBackCallback(BackCallback callback);
    void showTrack(const TrackInfo& track);
    void clear();

private:
    void changeListenerCallback(juce::ChangeBroadcaster* source) override;
    void updateStatusFromState();

    SterioPluginProcessor& processorRef;
    PluginState& pluginStateRef;

    TrackInfo currentTrack;
    bool hasTrack = false;

    juce::TextButton backButton;
    ListStatusView statusView;
    StemTimelineView timelineView;

    BackCallback backCallback;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TrackView)
};
