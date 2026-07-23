#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Services.h"
#include "TrackListPanel.h"
#include "projects/ProjectListPanel.h"
#include "projects/ProjectView.h"
#include <juce_events/juce_events.h>

class SterioPluginProcessor;

class MainContentComponent : public juce::Component, public juce::ChangeListener
{
public:
    MainContentComponent(Services& services, SterioPluginProcessor& processor);
    ~MainContentComponent() override;

    void resized() override;

    void changeListenerCallback(juce::ChangeBroadcaster* source) override;

    void updateView(); // called when auth state changes

    TrackListPanel trackListPanel;
    ProjectListPanel projectListPanel;

private:
    enum class ContentTab
    {
        Tracks,
        Projects
    };

    enum class ProjectsSubView
    {
        List,
        Detail
    };

    void setActiveTab(ContentTab tab);
    void showProjectList();
    void showProjectDetail(const ProjectSummary& project);
    void updateLoggedInContentVisibility();

    AuthManager& authRef;
    SterioPluginProcessor& processorRef;

    juce::Label loginMessage;
    juce::TextButton tracksTabButton;
    juce::TextButton projectsTabButton;
    ProjectView projectView;

    ContentTab activeTab = ContentTab::Tracks;
    ProjectsSubView projectsSubView = ProjectsSubView::List;
};
