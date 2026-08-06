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
      projectView(processor, services)
{
    authRef.addChangeListener(this);
    processorRef.getRemoteProjectOpenBroadcaster().addChangeListener(this);

    addAndMakeVisible(loginPrompt);
    addAndMakeVisible(tracksTabButton);
    addAndMakeVisible(projectsTabButton);
    addAndMakeVisible(trackListPanel);
    addAndMakeVisible(projectListPanel);
    addAndMakeVisible(projectView);

    SterioButtonStyle::apply(tracksTabButton, SterioButtonStyle::tabActive);
    SterioButtonStyle::apply(projectsTabButton, SterioButtonStyle::tab);

    tracksTabButton.onClick = [this] { setActiveTab(ContentTab::Tracks); };
    projectsTabButton.onClick = [this] { setActiveTab(ContentTab::Projects); };

    projectListPanel.setProjectSelectedCallback([this](const ProjectSummary& project) {
        processorRef.selectProject(project);
        showProjectDetail(project);
    });

    projectView.setBackCallback([this] { showProjectList(); });

    projectView.setVisible(false);
    projectListPanel.setVisible(false);

    updateView();

    if (authRef.isLoggedIn() && pluginStateRef.getCurrentProject().hasValue())
        openLoadedProjectView();
}

MainContentComponent::~MainContentComponent()
{
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
    }
    else
    {
        trackListPanel.setVisible(false);
        projectListPanel.setVisible(false);
        projectView.setVisible(false);
        projectView.clear();
        projectsSubView = ProjectsSubView::List;
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

    updateLoggedInContentVisibility();
    resized();
}

void MainContentComponent::showProjectList()
{
    projectsSubView = ProjectsSubView::List;
    projectView.clear();
    projectListPanel.refreshProjects();
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

void MainContentComponent::showProjectDetail(const ProjectSummary& project)
{
    projectsSubView = ProjectsSubView::Detail;
    projectView.showProject(project);
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

    const bool showTracks = activeTab == ContentTab::Tracks;
    const bool showProjectListView = activeTab == ContentTab::Projects
                                     && projectsSubView == ProjectsSubView::List;
    const bool showProjectDetailView = activeTab == ContentTab::Projects
                                       && projectsSubView == ProjectsSubView::Detail;

    trackListPanel.setVisible(showTracks);
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
    else if (projectListPanel.isVisible())
        projectListPanel.setBounds(bounds);
    else if (projectView.isVisible())
        projectView.setBounds(bounds);
}
