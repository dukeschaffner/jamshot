#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include "../api/SterioApiClient.h"
#include "../Colors.h"
#include "../Services.h"

//==============================================================================
/** A panel that displays a list of liked tracks with refresh and load more functionality. */
class TrackListPanel : public juce::Component, private juce::Timer, private juce::ChangeListener
{
public:
    /** Callback function type for track selection */
    using TrackSelectedCallback = std::function<void(const TrackInfo&)>;

    TrackListPanel(Services& services);
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

    void selectTrackById(const juce::String& trackId);

private:
    //==============================================================================
    class TrackListBoxModel : public juce::ListBoxModel
    {
    public:
        TrackListBoxModel(TrackListPanel& owner) : ownerPanel(owner) {}

        int getNumRows() override
        {
            return ownerPanel.tracks.size() + (ownerPanel.pagination.hasMore ? 1 : 0);
        }

        void paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected) override
        {
            // Check if this is the load more button row
            if (rowNumber == ownerPanel.tracks.size() && ownerPanel.pagination.hasMore)
            {
                g.fillAll(Colors::WHITE);

                // Draw "Load More" button appearance
                juce::Rectangle<int> buttonBounds(10, 5, width - 20, height - 10);
                g.setColour(Colors::RUSTIC_PINK);
                g.fillRoundedRectangle(buttonBounds.toFloat(), 4.0f);

                g.setColour(Colors::WHITE);
                g.setFont(juce::Font(14.0f, juce::Font::bold));
                g.drawText("Load More", buttonBounds, juce::Justification::centred, true);

                return;
            }

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
            juce::Font infoFont(11.0f);
            
            juce::Rectangle<int> bounds(8, 0, width - 16, height);
            
            // Title in bold (top 40% of height)
            g.setFont(titleFont);
            auto titleBounds = bounds.removeFromTop(static_cast<int>(height * 0.4f));
            if (track.title.isNotEmpty())
                g.drawText(track.title, titleBounds, juce::Justification::left, true);
            
            // Bottom section for artist and timing info
            auto bottomBounds = bounds;
            
            // Build info string: "Artist • BPM: 120 • 4/4"
            juce::String infoText;
            
            // Safely build the info text
            if (track.username.isNotEmpty())
                infoText = track.username;
            
            if (track.metronome.isNotEmpty())
            {
                if (infoText.isNotEmpty())
                    infoText += " • ";
                infoText += "BPM: " + track.metronome;
            }
                
            if (track.timeSignature.isNotEmpty())
            {
                if (infoText.isNotEmpty())
                    infoText += " • ";
                infoText += track.timeSignature;
            }
            
            // Only draw if we have valid text to display
            if (infoText.isNotEmpty())
            {
                // Info in regular weight with slightly muted color
                g.setFont(infoFont);
                if (!rowIsSelected)
                    g.setColour(Colors::GREY);
                g.drawText(infoText, bottomBounds, juce::Justification::left, true);
            }

            // Draw selection indicator with seafoam color
            if (rowIsSelected)
            {
                g.setColour(Colors::WHITE.withAlpha(0.9f));
                juce::Path tickPath;
                tickPath.addTriangle(4, height / 2 - 4, 4, height / 2 + 4, 12, height / 2);
                g.fillPath(tickPath);
            }

            // Draw thin light grey line at bottom of each track
            g.setColour(Colors::LIGHT_GREY);
            g.drawLine(0, height - 1, width, height - 1, 1.0f);
        }

        juce::MouseCursor getMouseCursorForRow(int row) override
        {
            return juce::MouseCursor::PointingHandCursor;
        }

        void listBoxItemClicked(int row, const juce::MouseEvent&) override
        {
            // Check if this is the load more button row
            if (row == ownerPanel.tracks.size() && ownerPanel.pagination.hasMore)
            {
                ownerPanel.loadMoreTracks();
                return;
            }

            ownerPanel.selectTrack(row);
        }

    private:
        TrackListPanel& ownerPanel;
    };

    void timerCallback() override;
    void changeListenerCallback(juce::ChangeBroadcaster*) override;

    /** Load tracks from the API. */
    void loadTracksInternal(int page);

    /** Update the UI after tracks are loaded. */
    void updateTracksDisplay(const LikedTracksResponse& response);

    /** Handle track selection. */
    void selectTrack(int trackIndex);

    SterioApiClient& apiClientRef;
    PluginState& pluginStateRef;
    juce::String currentUsername;

    juce::Array<TrackInfo> tracks;
    PaginationInfo pagination;
    int currentPage = 1;
    bool isLoading = false;

    TrackSelectedCallback trackSelectedCallback;

    // UI components
    juce::DrawableButton refreshButton;
    juce::Label statusLabel;
    juce::ListBox trackListBox;
    juce::ScrollBar scrollBar;
    
    // Icon for refresh button
    std::unique_ptr<juce::Drawable> refreshIcon;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TrackListPanel)
};