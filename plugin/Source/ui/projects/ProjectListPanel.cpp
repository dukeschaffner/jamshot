#include "ProjectListPanel.h"
#include "../../Colors.h"
#include "../../utils/MessageStore.h"
#include <chrono>

using namespace juce;

//==============================================================================
ProjectListPanel::ProjectListPanel(Services& services)
    : apiClientRef(services.api),
      titleLabel({}, "Projects"),
      projectListBox("Projects", nullptr),
      refreshButton("Refresh", DrawableButton::ImageFitted)
{
    addAndMakeVisible(titleLabel);
    addAndMakeVisible(refreshButton);

    auto svgFile = File::getSpecialLocation(File::currentExecutableFile)
                      .getParentDirectory()
                      .getChildFile("Assets")
                      .getChildFile("icons")
                      .getChildFile("refresh.svg");

    if (!svgFile.existsAsFile())
    {
        svgFile = File(__FILE__).getParentDirectory()
                     .getParentDirectory()
                     .getParentDirectory()
                     .getParentDirectory()
                     .getChildFile("Assets")
                     .getChildFile("icons")
                     .getChildFile("refresh.svg");
    }

    if (svgFile.existsAsFile())
    {
        auto svgContent = svgFile.loadFileAsString();
        svgContent = svgContent.replace("currentColor", "black");

        auto svgXml = XmlDocument::parse(svgContent);
        if (svgXml != nullptr)
        {
            refreshIcon = Drawable::createFromSVG(*svgXml);
            if (refreshIcon != nullptr)
                refreshButton.setImages(refreshIcon.get(), refreshIcon.get(), refreshIcon.get());
        }
    }

    refreshButton.onClick = [this] { refreshProjects(); };
    refreshButton.setColour(DrawableButton::backgroundColourId, Colors::WHITE);

    addAndMakeVisible(statusLabel);
    statusLabel.setText("No projects loaded", dontSendNotification);
    statusLabel.setJustificationType(Justification::centred);
    statusLabel.setColour(Label::textColourId, Colors::GREY);

    titleLabel.setJustificationType(Justification::centredLeft);
    titleLabel.setColour(Label::textColourId, Colors::BLACK);

    projectListBox.setModel(new ProjectListPanel::ProjectListBoxModel(*this));
    projectListBox.setRowHeight(40);
    projectListBox.setMultipleSelectionEnabled(false);
    projectListBox.setColour(ListBox::backgroundColourId, Colours::white);
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
    g.fillAll(Colors::WHITE);
}

void ProjectListPanel::resized()
{
    auto bounds = getLocalBounds().toFloat();
    const bool showEmptyState = projects.isEmpty();

    projectListBox.setVisible(!showEmptyState);
    statusLabel.setVisible(showEmptyState);

    FlexBox main;
    main.flexDirection = FlexBox::Direction::column;

    FlexBox buttonRow;
    buttonRow.flexDirection = FlexBox::Direction::row;
    buttonRow.justifyContent = FlexBox::JustifyContent::spaceBetween;

    buttonRow.items.add(
        FlexItem(titleLabel)
            .withMinWidth(100.0f)
            .withFlex(1.0f)
            .withHeight(20.0f)
    );

    buttonRow.items.add(
        FlexItem(refreshButton)
            .withWidth(20.0f)
            .withHeight(20.0f)
    );

    main.items.add(FlexItem(buttonRow).withHeight(20.0f));

    if (showEmptyState)
        main.items.add(FlexItem(statusLabel).withFlex(1.0f));
    else
        main.items.add(FlexItem(projectListBox).withFlex(1.0f));

    main.performLayout(bounds);
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
    statusLabel.setText("No projects", dontSendNotification);
    resized();
}

void ProjectListPanel::timerCallback()
{
    resized();

    if (isLoading)
        statusLabel.setText("Loading projects...", dontSendNotification);
    else if (hasLoadError)
        statusLabel.setText("Failed to load projects", dontSendNotification);
    else if (projects.isEmpty())
        statusLabel.setText("No projects", dontSendNotification);
    else
        statusLabel.setText(String(projects.size()) + " projects loaded", dontSendNotification);
}

void ProjectListPanel::loadProjectsInternal()
{
    if (isLoading)
        return;

    isLoading = true;

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
                statusLabel.setText("Failed to load projects", dontSendNotification);
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
