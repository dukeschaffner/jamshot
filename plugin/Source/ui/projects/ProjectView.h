#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include "../../PluginProcessor.h"
#include "../../Services.h"
#include "../../Colors.h"
#include "ProjectTimelineView.h"

//==============================================================================
/** Container for a selected project's header, load status, and timeline. */
class ProjectView : public juce::Component, private juce::ChangeListener
{
public:
    using BackCallback = std::function<void()>;

    ProjectView(SterioPluginProcessor& processor, Services& services);
    ~ProjectView() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void setBackCallback(BackCallback callback);

    /** Show project header and refresh timeline when stems finish loading. */
    void showProject(const ProjectSummary& project);

    void clear();

private:
    void changeListenerCallback(juce::ChangeBroadcaster* source) override;
    void updateStatusFromState();

    SterioPluginProcessor& processorRef;
    PluginState& pluginStateRef;

    ProjectSummary currentProject;
    bool hasProject = false;

    juce::TextButton backButton;
    juce::Label titleLabel;
    juce::Label detailsLabel;
    juce::Label statusLabel;
    ProjectTimelineView timelineView;

    BackCallback backCallback;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProjectView)
};
