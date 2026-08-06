#include "ProjectListPanel.h"
#include "../../Colors.h"
#include "../../utils/MessageStore.h"
#include <chrono>

using namespace juce;

//==============================================================================
ProjectListPanel::ProjectListPanel(Services& services)
    : apiClientRef(services.api),
      sectionHeader("Projects"),
      projectListBox("Projects")
{
    addAndMakeVisible(sectionHeader);
    sectionHeader.setOnRefresh([this] { refreshProjects(); });

    addAndMakeVisible(statusView);
    statusView.setState(ListStatusView::State::Empty, "No projects loaded");

    projectListBox.setModel(new ProjectListPanel::ProjectListBoxModel(*this));
    projectListBox.setRowHeight(UiMetrics::listRowH);
    projectListBox.setMultipleSelectionEnabled(false);
    projectListBox.setColour(ListBox::backgroundColourId, Colors::BACKGROUND);
    projectListBox.setColour(ListBox::outlineColourId, Colours::transparentBlack);
    addAndMakeVisible(projectListBox);

    startTimer(100);
}

ProjectListPanel::~ProjectListPanel()
{
    stopTimer();
}

void ProjectListPanel::paint(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);
}

void ProjectListPanel::resized()
{
    auto bounds = getLocalBounds();
    sectionHeader.setBounds(bounds.removeFromTop(UiMetrics::sectionChromeH));

    updateStatusView();

    const bool showList = !projects.isEmpty() && !isLoading;
    projectListBox.setVisible(showList);
    statusView.setVisible(!showList);

    auto content = bounds.withTrimmedLeft(UiMetrics::listPadX)
                         .withTrimmedRight(UiMetrics::listPadX)
                         .withTrimmedBottom(UiMetrics::space3);

    if (showList)
        projectListBox.setBounds(content);
    else
        statusView.setBounds(bounds);
}

void ProjectListPanel::updateStatusView()
{
    if (isLoading)
        statusView.setState(ListStatusView::State::Loading, "Loading projects...");
    else if (hasLoadError)
        statusView.setState(ListStatusView::State::Error, "Failed to load projects");
    else if (projects.isEmpty())
        statusView.setState(ListStatusView::State::Empty, "No projects");
}

void ProjectListPanel::refreshProjects()
{
    hasLoadError = false;
    projects.clear();
    projectListBox.deselectAllRows();
    projectListBox.updateContent();
    loadProjectsInternal();
}

void ProjectListPanel::setProjectSelectedCallback(ProjectSelectedCallback callback)
{
    projectSelectedCallback = std::move(callback);
}

void ProjectListPanel::clearProjects()
{
    projects.clear();
    hasLoadError = false;
    projectListBox.deselectAllRows();
    projectListBox.updateContent();
    updateStatusView();
    resized();
}

void ProjectListPanel::timerCallback()
{
    updateStatusView();
    resized();
}

void ProjectListPanel::loadProjectsInternal()
{
    if (isLoading)
        return;

    isLoading = true;
    resized();

    Thread::launch([this]() {
        auto result = apiClientRef.getProjects();

        if (result.failed())
        {
            DBG("ProjectListPanel::loadProjectsInternal() - error: " + result.getErrorMessage());
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to load projects.",
                .sourceModule = "ProjectListPanel",
                .timestamp = std::chrono::system_clock::now()
            });
        }

        MessageManager::callAsync([this, result]() {
            isLoading = false;

            if (result.failed())
            {
                hasLoadError = true;
                updateStatusView();
                resized();
                return;
            }

            hasLoadError = false;
            updateProjectsDisplay(*result);
        });
    });
}

void ProjectListPanel::updateProjectsDisplay(const Array<ProjectSummary>& loaded)
{
    projects = loaded;
    projectListBox.deselectAllRows();
    projectListBox.updateContent();
    resized();
}

void ProjectListPanel::selectProject(int projectIndex)
{
    if (projectIndex >= 0 && projectIndex < projects.size())
    {
        projectListBox.selectRow(projectIndex);

        if (projectSelectedCallback)
            projectSelectedCallback(projects[projectIndex]);
    }
}
