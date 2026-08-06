#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include "../../api/SterioApiClient.h"
#include "../../Colors.h"
#include "../../Services.h"
#include "../SectionHeaderBar.h"
#include "../ListStatusView.h"
#include "../ListRowPainter.h"
#include "../HoverTrackingListBox.h"

//==============================================================================
/** A panel that displays the user's projects with refresh and selection. */
class ProjectListPanel : public juce::Component, private juce::Timer
{
public:
    using ProjectSelectedCallback = std::function<void(const ProjectSummary&)>;

    ProjectListPanel(Services& services);
    ~ProjectListPanel() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void refreshProjects();
    void setProjectSelectedCallback(ProjectSelectedCallback callback);
    void clearProjects();

private:
    class ProjectListBoxModel : public juce::ListBoxModel
    {
    public:
        ProjectListBoxModel(ProjectListPanel& owner) : ownerPanel(owner) {}

        int getNumRows() override
        {
            return ownerPanel.projects.size();
        }

        void paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected) override
        {
            if (rowNumber < 0 || rowNumber >= ownerPanel.projects.size())
                return;

            const auto& project = ownerPanel.projects[rowNumber];
            const bool hovered = rowNumber == ownerPanel.projectListBox.getHoveredRow();

            juce::String meta;
            if (project.role.isNotEmpty())
                meta = project.role;
            if (project.bpm > 0)
            {
                if (meta.isNotEmpty()) meta += metaSeparator();
                meta += "BPM: " + juce::String(project.bpm);
            }
            if (project.timeSignature.isNotEmpty())
            {
                if (meta.isNotEmpty()) meta += metaSeparator();
                meta += project.timeSignature;
            }

            ListRowPainter::paintRow(g, width, height, rowIsSelected, hovered,
                                     project.name, meta);
        }

        juce::MouseCursor getMouseCursorForRow(int) override
        {
            return juce::MouseCursor::PointingHandCursor;
        }

        void listBoxItemClicked(int row, const juce::MouseEvent&) override
        {
            ownerPanel.selectProject(row);
        }

    private:
        ProjectListPanel& ownerPanel;
    };

    void timerCallback() override;
    void loadProjectsInternal();
    void updateProjectsDisplay(const juce::Array<ProjectSummary>& loaded);
    void selectProject(int projectIndex);
    void updateStatusView();

    SterioApiClient& apiClientRef;

    juce::Array<ProjectSummary> projects;
    bool isLoading = false;
    bool hasLoadError = false;

    ProjectSelectedCallback projectSelectedCallback;

    SectionHeaderBar sectionHeader;
    ListStatusView statusView;
    HoverTrackingListBox projectListBox;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProjectListPanel)
};
