#include "ProjectView.h"

using namespace juce;

//==============================================================================
ProjectView::ProjectView(SterioPluginProcessor& processor, Services& services)
    : processorRef(processor),
      pluginStateRef(services.pluginState),
      backButton("Back"),
      titleLabel({}, ""),
      detailsLabel({}, ""),
      statusLabel({}, ""),
      timelineView(processor)
{
    pluginStateRef.addChangeListener(this);

    addAndMakeVisible(backButton);
    addAndMakeVisible(titleLabel);
    addAndMakeVisible(detailsLabel);
    addAndMakeVisible(statusLabel);
    addAndMakeVisible(timelineView);

    backButton.onClick = [this] {
        if (backCallback)
            backCallback();
    };

    titleLabel.setFont(Font(16.0f, Font::bold));
    titleLabel.setColour(Label::textColourId, Colors::BLACK);
    titleLabel.setJustificationType(Justification::centredLeft);

    detailsLabel.setFont(Font(12.0f));
    detailsLabel.setColour(Label::textColourId, Colors::GREY);
    detailsLabel.setJustificationType(Justification::centredLeft);

    statusLabel.setFont(Font(12.0f));
    statusLabel.setColour(Label::textColourId, Colors::GREY);
    statusLabel.setJustificationType(Justification::centred);
    statusLabel.setVisible(false);

    timelineView.setVisible(false);
}

ProjectView::~ProjectView()
{
    pluginStateRef.removeChangeListener(this);
}

void ProjectView::paint(Graphics& g)
{
    g.fillAll(Colors::WHITE);
}

void ProjectView::resized()
{
    auto bounds = getLocalBounds();

    auto header = bounds.removeFromTop(48);
    backButton.setBounds(header.removeFromLeft(60).reduced(4, 10));

    auto titleArea = header.reduced(4, 4);
    titleLabel.setBounds(titleArea.removeFromTop(22));
    detailsLabel.setBounds(titleArea);

    if (statusLabel.isVisible())
    {
        statusLabel.setBounds(bounds);
        timelineView.setBounds({});
    }
    else
    {
        timelineView.setBounds(bounds.reduced(0, 2));
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

    titleLabel.setText(project.name.isNotEmpty() ? project.name : "Untitled Project",
                       dontSendNotification);

    juce::String details = "BPM: " + String(project.bpm);
    if (project.timeSignature.isNotEmpty())
        details += "  |  " + project.timeSignature;
    detailsLabel.setText(details, dontSendNotification);

    timelineView.setProjectDuration(project.durationSeconds);
    timelineView.setVisible(false);
    statusLabel.setText("Loading project...", dontSendNotification);
    statusLabel.setVisible(true);
    resized();

    updateStatusFromState();
}

void ProjectView::clear()
{
    hasProject = false;
    currentProject = {};
    titleLabel.setText("", dontSendNotification);
    detailsLabel.setText("", dontSendNotification);
    statusLabel.setVisible(false);
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
        statusLabel.setText(text, dontSendNotification);
        statusLabel.setVisible(true);
        timelineView.setVisible(false);
        resized();
        return;
    }

    auto projectOpt = pluginStateRef.getCurrentProject();
    if (projectOpt.hasValue() && (*projectOpt).guid == currentProject.guid)
    {
        const auto& project = *projectOpt;
        titleLabel.setText(project.name, dontSendNotification);
        juce::String details = "BPM: " + String(project.bpm);
        if (project.timeSignature.isNotEmpty())
            details += "  |  " + project.timeSignature;
        detailsLabel.setText(details, dontSendNotification);
        timelineView.setProjectDuration(project.durationSeconds > 0.0
                                            ? project.durationSeconds
                                            : currentProject.durationSeconds);
    }

    const auto stems = processorRef.getLoadedStems();
    const auto clips = processorRef.getLoadedProjectClips();

    if (stems.isEmpty() && clips.isEmpty())
    {
        statusLabel.setText("No playable clips in this project", dontSendNotification);
        statusLabel.setVisible(true);
        timelineView.setVisible(false);
        resized();
        return;
    }

    statusLabel.setVisible(false);
    timelineView.setVisible(true);
    timelineView.refreshFromProcessor();
    resized();
}
