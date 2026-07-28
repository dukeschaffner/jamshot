#include "MainContentComponent.h"
#include "../PluginProcessor.h"
#include "../Colors.h"

MainContentComponent::MainContentComponent(Services& services, SterioPluginProcessor& processor)
    : trackListPanel(services),
      projectListPanel(services),
      authRef(services.auth),
      processorRef(processor),
      tracksTabButton("Tracks"),
      projectsTabButton("Projects"),
      projectView(processor, services)
{
    authRef.addChangeListener(this);

    addAndMakeVisible(tracksTabButton);
    addAndMakeVisible(projectsTabButton);
    addAndMakeVisible(trackListPanel);
    addAndMakeVisible(projectListPanel);
    addAndMakeVisible(projectView);
    addAndMakeVisible(loginMessage);

    loginMessage.setText("Log in to view liked tracks and projects", juce::dontSendNotification);
    loginMessage.setJustificationType(juce::Justification::centred);
    loginMessage.setColour(juce::Label::textColourId, Colors::GREY);

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
}

MainContentComponent::~MainContentComponent()
{
    authRef.removeChangeListener(this);
}

void MainContentComponent::updateView()
{
    const bool loggedIn = authRef.isLoggedIn();

    loginMessage.setVisible(!loggedIn);
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

void MainContentComponent::changeListenerCallback(juce::ChangeBroadcaster*)
{
    DBG("MainContentComponent::changeListenerCallback() - AuthManager changed");
    updateView();
}

void MainContentComponent::setActiveTab(ContentTab tab)
{
    activeTab = tab;

    // Always land on the projects list when entering the Projects tab.
    // Restoring a stale detail view after visiting Tracks leaves a project UI
    // that was never reloaded, while the footer can still show a selected track.
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

void MainContentComponent::showProjectDetail(const ProjectSummary& project)
{
    projectsSubView = ProjectsSubView::Detail;
    projectView.showProject(project);
    updateLoggedInContentVisibility();
    resized();
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

    tracksTabButton.setColour(juce::TextButton::buttonColourId,
                              showTracks ? Colors::SEAFOAM : Colors::LIGHT_GREY);
    projectsTabButton.setColour(juce::TextButton::buttonColourId,
                                activeTab == ContentTab::Projects ? Colors::SEAFOAM : Colors::LIGHT_GREY);
}

void MainContentComponent::resized()
{
    auto bounds = getLocalBounds();

    if (!authRef.isLoggedIn())
    {
        loginMessage.setBounds(bounds);
        return;
    }

    auto tabBar = bounds.removeFromTop(28);
    tracksTabButton.setBounds(tabBar.removeFromLeft(tabBar.getWidth() / 2).reduced(2, 2));
    projectsTabButton.setBounds(tabBar.reduced(2, 2));

    if (trackListPanel.isVisible())
        trackListPanel.setBounds(bounds);
    else if (projectListPanel.isVisible())
        projectListPanel.setBounds(bounds);
    else if (projectView.isVisible())
        projectView.setBounds(bounds);
}
