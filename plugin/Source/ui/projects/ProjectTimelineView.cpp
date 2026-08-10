#include "ProjectTimelineView.h"
#include "../timeline/buildProjectTimelineLanes.h"
#include "../../Colors.h"

using namespace juce;

ProjectTimelineView::ProjectTimelineView(SterioPluginProcessor& processor)
    : processorRef(processor),
      timelineView(processor)
{
    addAndMakeVisible(timelineView);
}

void ProjectTimelineView::paint(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);
}

void ProjectTimelineView::resized()
{
    timelineView.setBounds(getLocalBounds());
}

void ProjectTimelineView::setProjectDuration(double durationSeconds)
{
    timelineView.setDurationSeconds(durationSeconds);
}

void ProjectTimelineView::refreshFromProcessor()
{
    timelineView.setLanes(buildProjectTimelineLanes(processorRef));
}
