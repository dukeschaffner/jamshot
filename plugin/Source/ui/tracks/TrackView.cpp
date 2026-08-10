#include "TrackView.h"
#include "../timeline/buildTrackTimelineLanes.h"
#include "../../Colors.h"

using namespace juce;

//==============================================================================
TrackView::TrackView(SterioPluginProcessor& processor, Services& services)
    : processorRef(processor),
      pluginStateRef(services.pluginState),
      backButton(String(CharPointer_UTF8("\xe2\x86\x90"))),
      timelineView(processor)
{
    pluginStateRef.addChangeListener(this);

    addAndMakeVisible(statusView);
    addAndMakeVisible(timelineView);
    addAndMakeVisible(backButton);

    SterioButtonStyle::apply(backButton, SterioButtonStyle::projectBack);
    backButton.setTooltip("Back to tracks");
    backButton.onClick = [this] {
        if (backCallback)
            backCallback();
    };

    statusView.setVisible(false);
    timelineView.setVisible(false);
}

TrackView::~TrackView()
{
    pluginStateRef.removeChangeListener(this);
}

void TrackView::paint(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);
}

void TrackView::resized()
{
    auto bounds = getLocalBounds();

    backButton.setBounds(6, 6, UiMetrics::projectBackSize, UiMetrics::projectBackSize);
    backButton.toFront(false);

    if (statusView.isVisible())
    {
        statusView.setBounds(bounds);
        timelineView.setBounds({});
    }
    else
    {
        timelineView.setBounds(bounds);
        statusView.setBounds({});
    }
}

void TrackView::setBackCallback(BackCallback callback)
{
    backCallback = std::move(callback);
}

void TrackView::showTrack(const TrackInfo& track)
{
    hasTrack = true;
    currentTrack = track;

    timelineView.setVisible(false);
    statusView.setState(ListStatusView::State::Loading, "Loading track...");
    statusView.setVisible(true);
    resized();

    updateStatusFromState();
}

void TrackView::clear()
{
    hasTrack = false;
    currentTrack = {};
    statusView.setVisible(false);
    timelineView.setVisible(false);
}

void TrackView::changeListenerCallback(ChangeBroadcaster*)
{
    updateStatusFromState();
}

void TrackView::updateStatusFromState()
{
    if (!hasTrack)
        return;

    auto trackOpt = pluginStateRef.getCurrentTrack();
    if (!trackOpt.hasValue() || (*trackOpt).id != currentTrack.id)
    {
        statusView.setState(ListStatusView::State::Loading, "Loading track...");
        statusView.setVisible(true);
        timelineView.setVisible(false);
        resized();
        return;
    }

    currentTrack = *trackOpt;

    if (pluginStateRef.isTrackStemsLoading())
    {
        statusView.setState(ListStatusView::State::Loading, "Loading audio...");
        statusView.setVisible(true);
        timelineView.setVisible(false);
        resized();
        return;
    }

    auto lanes = buildTrackTimelineLanes(processorRef);
    if (lanes.isEmpty())
    {
        statusView.setState(ListStatusView::State::Empty, "No playable stems in this track");
        statusView.setVisible(true);
        timelineView.setVisible(false);
        resized();
        return;
    }

    timelineView.setDurationSeconds(computeTrackTimelineDuration(lanes));
    timelineView.setLanes(std::move(lanes));
    statusView.setVisible(false);
    timelineView.setVisible(true);
    resized();
}
