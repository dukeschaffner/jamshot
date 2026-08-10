#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Services.h"
#include "TrackListPanel.h"
#include "projects/ProjectListPanel.h"
#include "projects/ProjectView.h"
#include "tracks/TrackView.h"
#include "LoginPromptCard.h"
#include <juce_events/juce_events.h>

class SterioPluginProcessor;

class MainContentComponent : public juce::Component, public juce::ChangeListener
{
public:
    MainContentComponent(Services& services, SterioPluginProcessor& processor);
    ~MainContentComponent() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void changeListenerCallback(juce::ChangeBroadcaster* source) override;

    void updateView();

    TrackListPanel trackListPanel;
    ProjectListPanel projectListPanel;

    /** Open track detail for a selected/liked track (list click or remote open). */
    void showTrackDetail(const TrackInfo& track);

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

    enum class TracksSubView
    {
        List,
        Detail
    };

    void setActiveTab(ContentTab tab);
    void showProjectList();
    void showProjectDetail(const ProjectSummary& project);
    void showTrackList();
    void updateLoggedInContentVisibility();
    void openLoadedProjectView();
    void openLoadedTrackView();
    void updateTabStyles();

    AuthManager& authRef;
    PluginState& pluginStateRef;
    SterioPluginProcessor& processorRef;

    LoginPromptCard loginPrompt;
    juce::TextButton tracksTabButton;
    juce::TextButton projectsTabButton;
    ProjectView projectView;
    TrackView trackView;

    ContentTab activeTab = ContentTab::Tracks;
    ProjectsSubView projectsSubView = ProjectsSubView::List;
    TracksSubView tracksSubView = TracksSubView::List;
};
