#include "ProjectView.h"

using namespace juce;

//==============================================================================
ProjectView::ProjectView(SterioPluginProcessor& processor, Services& services)
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
    backButton.setTooltip("Back to projects");
    backButton.onClick = [this] {
        if (backCallback)
            backCallback();
    };

    statusView.setVisible(false);
    timelineView.setVisible(false);
}

ProjectView::~ProjectView()
{
    pluginStateRef.removeChangeListener(this);
}

void ProjectView::paint(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);
}

void ProjectView::resized()
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

void ProjectView::setBackCallback(BackCallback callback)
{
    backCallback = std::move(callback);
}

void ProjectView::showProject(const ProjectSummary& project)
{
    hasProject = true;
    currentProject = project;

    timelineView.setProjectDuration(project.durationSeconds);
    timelineView.setVisible(false);
    statusView.setState(ListStatusView::State::Loading, "Loading project...");
    statusView.setVisible(true);
    resized();

    updateStatusFromState();
}

void ProjectView::clear()
{
    hasProject = false;
    currentProject = {};
    statusView.setVisible(false);
    timelineView.setVisible(false);
}

void ProjectView::changeListenerCallback(ChangeBroadcaster*)
{
    updateStatusFromState();
}

void ProjectView::updateStatusFromState()
{
    if (!hasProject)
        return;

    auto progressOpt = pluginStateRef.getProjectLoadProgress();
    if (progressOpt.hasValue())
    {
        const auto& progress = *progressOpt;
        juce::String text = progress.total > 0
            ? "Loading audio (" + String(progress.current) + " of " + String(progress.total) + ")..."
            : "Loading project...";
        statusView.setState(ListStatusView::State::Loading, text);
        statusView.setVisible(true);
        timelineView.setVisible(false);
        resized();
        return;
    }

    auto projectOpt = pluginStateRef.getCurrentProject();
    if (projectOpt.hasValue() && (*projectOpt).guid == currentProject.guid)
    {
        const auto& project = *projectOpt;
        currentProject.name = project.name;
        currentProject.bpm = project.bpm;
        currentProject.timeSignature = project.timeSignature;
        currentProject.durationSeconds = project.durationSeconds;
        timelineView.setProjectDuration(project.durationSeconds > 0.0
                                            ? project.durationSeconds
                                            : currentProject.durationSeconds);
    }

    const auto stems = processorRef.getLoadedStems();
    const auto clips = processorRef.getLoadedProjectClips();

    if (stems.isEmpty() && clips.isEmpty())
    {
        statusView.setState(ListStatusView::State::Empty, "No playable clips in this project");
        statusView.setVisible(true);
        timelineView.setVisible(false);
        resized();
        return;
    }

    statusView.setVisible(false);
    timelineView.setVisible(true);
    timelineView.refreshFromProcessor();
    resized();
}
