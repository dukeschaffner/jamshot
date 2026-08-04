#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include "../../api/SterioApiClient.h"
#include "../../Colors.h"
#include "../../Services.h"

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

    /** Refresh the project list from the API. */
    void refreshProjects();

    /** Set callback for when a project is selected. */
    void setProjectSelectedCallback(ProjectSelectedCallback callback);

    /** Clear the project list and selection. */
    void clearProjects();

private:
    //==============================================================================
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

            if (rowIsSelected)
            {
                juce::ColourGradient gradient(Colors::SEAFOAM, 0, 0, Colors::RUSTIC_PINK, width, 0, false);
                g.setGradientFill(gradient);
                g.fillAll();
            }
            else
            {
                g.fillAll(Colors::WHITE);
            }

            g.setColour(rowIsSelected ? Colors::WHITE : Colors::BLACK);

            juce::Font titleFont(14.0f, juce::Font::bold);
            juce::Font infoFont(11.0f);

            juce::Rectangle<int> bounds(8, 0, width - 16, height);

            g.setFont(titleFont);
            auto titleBounds = bounds.removeFromTop(static_cast<int>(height * 0.4f));
            if (project.name.isNotEmpty())
                g.drawText(project.name, titleBounds, juce::Justification::left, true);

            juce::String infoText;
            if (project.role.isNotEmpty())
                infoText = project.role;

            if (project.bpm > 0)
            {
                if (infoText.isNotEmpty())
                    infoText += " • ";
                infoText += "BPM: " + juce::String(project.bpm);
            }

            if (project.timeSignature.isNotEmpty())
            {
                if (infoText.isNotEmpty())
                    infoText += " • ";
                infoText += project.timeSignature;
            }

            if (infoText.isNotEmpty())
            {
                g.setFont(infoFont);
                if (!rowIsSelected)
                    g.setColour(Colors::GREY);
                g.drawText(infoText, bounds, juce::Justification::left, true);
            }

            if (rowIsSelected)
            {
                g.setColour(Colors::WHITE.withAlpha(0.9f));
                juce::Path tickPath;
                tickPath.addTriangle(4, height / 2 - 4, 4, height / 2 + 4, 12, height / 2);
                g.fillPath(tickPath);
            }

            g.setColour(Colors::LIGHT_GREY);
            g.drawLine(0, height - 1, width, height - 1, 1.0f);
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

    SterioApiClient& apiClientRef;

    juce::Array<ProjectSummary> projects;
    bool isLoading = false;
    bool hasLoadError = false;

    ProjectSelectedCallback projectSelectedCallback;

    juce::Label titleLabel;
    juce::DrawableButton refreshButton;
    juce::Label statusLabel;
    juce::ListBox projectListBox;
    std::unique_ptr<juce::Drawable> refreshIcon;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProjectListPanel)
};
