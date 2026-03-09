#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../api/SterioApiClient.h"
#include "../Colors.h"

//==============================================================================
/** A panel that displays a list of liked tracks with refresh and load more functionality. */
class TrackListPanel : public juce::Component, private juce::Timer
{
public:
    /** Callback function type for track selection */
    using TrackSelectedCallback = std::function<void(const TrackInfo&)>;

    TrackListPanel(SterioApiClient& apiClient);
    ~TrackListPanel() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    /** Set the username to load liked tracks for. */
    void setUsername(const juce::String& username);

    /** Refresh the track list from the beginning. */
    void refreshTracks();

    /** Load the next page of tracks. */
    void loadMoreTracks();

    /** Set callback for when a track is selected. */
    void setTrackSelectedCallback(TrackSelectedCallback callback);

    /** Get the currently selected track, or nullptr if none selected. */
    const TrackInfo* getSelectedTrack() const;

    /** Clear the track list and selection. */
    void clearTracks();

private:
    //==============================================================================
    class TrackListBoxModel : public juce::ListBoxModel
    {
    public:
        TrackListBoxModel(TrackListPanel& owner) : ownerPanel(owner) {}

        int getNumRows() override
        {
            return ownerPanel.tracks.size();
        }

        void paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected) override
        {
            if (rowNumber < 0 || rowNumber >= ownerPanel.tracks.size())
                return;

            const auto& track = ownerPanel.tracks[rowNumber];

            // Background - use brand colors
            if (rowIsSelected)
            {
                // Gradient background for selected items
                juce::ColourGradient gradient(Colors::SEAFOAM, 0, 0, Colors::RUSTIC_PINK, width, 0, false);
                g.setGradientFill(gradient);
                g.fillAll();
            }
            else
            {
                g.fillAll(Colors::WHITE);
            }

            // Text color
            g.setColour(rowIsSelected ? Colors::WHITE : Colors::BLACK);

            // Draw track title and artist
            juce::Font titleFont(14.0f, juce::Font::bold);
            juce::Font artistFont(12.0f);
            
            juce::Rectangle<int> bounds(8, 0, width - 16, height);
            
            // Title in bold
            g.setFont(titleFont);
            g.drawText(track.title, bounds.removeFromTop(height / 2), juce::Justification::left, true);
            
            // Artist in regular weight with slightly muted color
            g.setFont(artistFont);
            if (!rowIsSelected)
                g.setColour(Colors::GREY);
            g.drawText(track.username, bounds, juce::Justification::left, true);

            // Draw selection indicator with seafoam color
            if (rowIsSelected)
            {
                g.setColour(Colors::WHITE.withAlpha(0.9f));
                juce::Path tickPath;
                tickPath.addTriangle(4, height / 2 - 4, 4, height / 2 + 4, 12, height / 2);
                g.fillPath(tickPath);
            }
        }

        void listBoxItemClicked(int row, const juce::MouseEvent&) override
        {
            ownerPanel.selectTrack(row);
        }

    private:
        TrackListPanel& ownerPanel;
    };

    void timerCallback() override;

    /** Load tracks from the API. */
    void loadTracksInternal(int page);

    /** Update the UI after tracks are loaded. */
    void updateTracksDisplay(const LikedTracksResponse& response);

    /** Handle track selection. */
    void selectTrack(int trackIndex);

    SterioApiClient& apiClientRef;
    juce::String currentUsername;

    juce::Array<TrackInfo> tracks;
    PaginationInfo pagination;
    int currentPage = 1;
    int selectedTrackIndex = -1;
    bool isLoading = false;

    TrackSelectedCallback trackSelectedCallback;

    // UI components
    juce::TextButton refreshButton;
    juce::TextButton loadMoreButton;
    juce::Label statusLabel;
    juce::ListBox trackListBox;
    juce::ScrollBar scrollBar;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TrackListPanel)
};