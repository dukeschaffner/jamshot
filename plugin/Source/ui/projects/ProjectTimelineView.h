#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../../PluginProcessor.h"
#include "../timeline/StemTimelineView.h"

//==============================================================================
/** Project timeline adapter over shared StemTimelineView. */
class ProjectTimelineView : public juce::Component
{
public:
    explicit ProjectTimelineView(SterioPluginProcessor& processor);
    ~ProjectTimelineView() override = default;

    void paint(juce::Graphics& g) override;
    void resized() override;

    /** Reload timeline from processor's loaded project clips/tracks/stems. */
    void refreshFromProcessor();

    void setProjectDuration(double durationSeconds);

private:
    SterioPluginProcessor& processorRef;
    StemTimelineView timelineView;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProjectTimelineView)
};
