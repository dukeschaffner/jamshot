#include "MainContentComponent.h"
#include "../PluginProcessor.h"
#include "../Colors.h"

MainContentComponent::MainContentComponent(Services& services, SterioPluginProcessor& processor)
    : trackListPanel(services),
      projectListPanel(services),
      authRef(services.auth),
      pluginStateRef(services.pluginState),
      processorRef(processor),
      tracksTabButton("Tracks"),
      projectsTabButton("Projects"),
      projectView(processor, services),
      trackView(processor, services)
{
    authRef.addChangeListener(this);
    processorRef.getRemoteProjectOpenBroadcaster().addChangeListener(this);
    processorRef.getRemoteTrackOpenBroadcaster().addChangeListener(this);

    addAndMakeVisible(loginPrompt);
    addAndMakeVisible(tracksTabButton);
    addAndMakeVisible(projectsTabButton);
    addAndMakeVisible(trackListPanel);
    addAndMakeVisible(projectListPanel);
    addAndMakeVisible(projectView);
    addAndMakeVisible(trackView);

    SterioButtonStyle::apply(tracksTabButton, SterioButtonStyle::tabActive);
    SterioButtonStyle::apply(projectsTabButton, SterioButtonStyle::tab);

    tracksTabButton.onClick = [this] { setActiveTab(ContentTab::Tracks); };
    projectsTabButton.onClick = [this] { setActiveTab(ContentTab::Projects); };

    projectListPanel.setProjectSelectedCallback([this](const ProjectSummary& project) {
        processorRef.selectProject(project);
        showProjectDetail(project);
    });

    projectView.setBackCallback([this] { showProjectList(); });
    trackView.setBackCallback([this] { showTrackList(); });

    projectView.setVisible(false);
    projectListPanel.setVisible(false);
    trackView.setVisible(false);

    updateView();

    if (authRef.isLoggedIn() && pluginStateRef.getCurrentProject().hasValue())
        openLoadedProjectView();
    else if (authRef.isLoggedIn() && pluginStateRef.getCurrentTrack().hasValue())
        openLoadedTrackView();
}

MainContentComponent::~MainContentComponent()
{
    processorRef.getRemoteTrackOpenBroadcaster().removeChangeListener(this);
    processorRef.getRemoteProjectOpenBroadcaster().removeChangeListener(this);
    authRef.removeChangeListener(this);
}

void MainContentComponent::paint(juce::Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);

    if (authRef.isLoggedIn())
    {
        g.setColour(Colors::GREY_2);
        g.fillRect(0, UiMetrics::tabBarH - 1, getWidth(), 1);
    }
}

void MainContentComponent::updateView()
{
    const bool loggedIn = authRef.isLoggedIn();

    loginPrompt.setVisible(!loggedIn);
    tracksTabButton.setVisible(loggedIn);
    projectsTabButton.setVisible(loggedIn);

    if (loggedIn)
    {
        updateLoggedInContentVisibility();
        if (activeTab == ContentTab::Projects && projectsSubView == ProjectsSubView::List)
            projectListPanel.refreshProjects();
        if (activeTab == ContentTab::Tracks && tracksSubView == TracksSubView::List)
            trackListPanel.refreshTracks();
    }
    else
    {
        trackListPanel.setVisible(false);
        projectListPanel.setVisible(false);
        projectView.setVisible(false);
        projectView.clear();
        trackView.setVisible(false);
        trackView.clear();
        projectsSubView = ProjectsSubView::List;
        tracksSubView = TracksSubView::List;
    }

    resized();
}

void MainContentComponent::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    if (source == &processorRef.getRemoteProjectOpenBroadcaster())
    {
        DBG("MainContentComponent::changeListenerCallback() - remote project opened");
        openLoadedProjectView();
        return;
    }

    if (source == &processorRef.getRemoteTrackOpenBroadcaster())
    {
        DBG("MainContentComponent::changeListenerCallback() - remote track opened");
        openLoadedTrackView();
        return;
    }

    DBG("MainContentComponent::changeListenerCallback() - AuthManager changed");
    updateView();
}

void MainContentComponent::setActiveTab(ContentTab tab)
{
    activeTab = tab;

    if (tab == ContentTab::Projects)
    {
        processorRef.clearSelection();
        showProjectList();
        return;
    }

    // Tracks tab: return to list (do not clear an already-loaded track unless switching from projects)
    showTrackList();
}

void MainContentComponent::showProjectList()
{
    projectsSubView = ProjectsSubView::List;
    projectView.clear();
    projectListPanel.refreshProjects();
    updateLoggedInContentVisibility();
    resized();
}

void MainContentComponent::showTrackList()
{
    tracksSubView = TracksSubView::List;
    trackView.clear();
    updateLoggedInContentVisibility();
    resized();
}

void MainContentComponent::openLoadedProjectView()
{
    if (!authRef.isLoggedIn())
        return;

    auto projectOpt = pluginStateRef.getCurrentProject();
    if (!projectOpt.hasValue())
        return;

    const auto& info = *projectOpt;
    ProjectSummary summary;
    summary.guid = info.guid;
    summary.name = info.name;
    summary.bpm = info.bpm;
    summary.timeSignature = info.timeSignature;
    summary.durationSeconds = info.durationSeconds;

    activeTab = ContentTab::Projects;
    showProjectDetail(summary);
}

void MainContentComponent::openLoadedTrackView()
{
    if (!authRef.isLoggedIn())
        return;

    auto trackOpt = pluginStateRef.getCurrentTrack();
    if (!trackOpt.hasValue())
        return;

    activeTab = ContentTab::Tracks;
    showTrackDetail(*trackOpt);
}

void MainContentComponent::showProjectDetail(const ProjectSummary& project)
{
    projectsSubView = ProjectsSubView::Detail;
    projectView.showProject(project);
    updateLoggedInContentVisibility();
    resized();
}

void MainContentComponent::showTrackDetail(const TrackInfo& track)
{
    tracksSubView = TracksSubView::Detail;
    trackView.showTrack(track);
    updateLoggedInContentVisibility();
    resized();
}

void MainContentComponent::updateTabStyles()
{
    const bool tracksActive = activeTab == ContentTab::Tracks;
    SterioButtonStyle::apply(tracksTabButton,
                             tracksActive ? SterioButtonStyle::tabActive : SterioButtonStyle::tab);
    SterioButtonStyle::apply(projectsTabButton,
                             !tracksActive ? SterioButtonStyle::tabActive : SterioButtonStyle::tab);
}

void MainContentComponent::updateLoggedInContentVisibility()
{
    const bool loggedIn = authRef.isLoggedIn();
    if (!loggedIn)
        return;

    const bool showTrackListView = activeTab == ContentTab::Tracks
                                   && tracksSubView == TracksSubView::List;
    const bool showTrackDetailView = activeTab == ContentTab::Tracks
                                     && tracksSubView == TracksSubView::Detail;
    const bool showProjectListView = activeTab == ContentTab::Projects
                                     && projectsSubView == ProjectsSubView::List;
    const bool showProjectDetailView = activeTab == ContentTab::Projects
                                       && projectsSubView == ProjectsSubView::Detail;

    trackListPanel.setVisible(showTrackListView);
    trackView.setVisible(showTrackDetailView);
    projectListPanel.setVisible(showProjectListView);
    projectView.setVisible(showProjectDetailView);
    updateTabStyles();
}

void MainContentComponent::resized()
{
    auto bounds = getLocalBounds();

    if (!authRef.isLoggedIn())
    {
        loginPrompt.setBounds(bounds);
        tracksTabButton.setBounds({});
        projectsTabButton.setBounds({});
        trackListPanel.setBounds({});
        projectListPanel.setBounds({});
        projectView.setBounds({});
        trackView.setBounds({});
        return;
    }

    loginPrompt.setBounds({});

    auto tabBar = bounds.removeFromTop(UiMetrics::tabBarH);
    tabBar.removeFromLeft(UiMetrics::tabPadX);

    const int tabW = 80;
    tracksTabButton.setBounds(tabBar.removeFromLeft(tabW));
    tabBar.removeFromLeft(2);
    projectsTabButton.setBounds(tabBar.removeFromLeft(tabW));

    if (trackListPanel.isVisible())
        trackListPanel.setBounds(bounds);
    else if (trackView.isVisible())
        trackView.setBounds(bounds);
    else if (projectListPanel.isVisible())
        projectListPanel.setBounds(bounds);
    else if (projectView.isVisible())
        projectView.setBounds(bounds);
}
