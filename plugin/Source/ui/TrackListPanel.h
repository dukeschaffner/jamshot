#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_events/juce_events.h>
#include "../api/SterioApiClient.h"
#include "../Colors.h"
#include "../Services.h"
#include "SectionHeaderBar.h"
#include "ListStatusView.h"
#include "ListRowPainter.h"
#include "HoverTrackingListBox.h"

//==============================================================================
/** A panel that displays a list of liked tracks with refresh and load more functionality. */
class TrackListPanel : public juce::Component, private juce::Timer, private juce::ChangeListener
{
public:
    using TrackSelectedCallback = std::function<void(const TrackInfo&)>;

    TrackListPanel(Services& services);
    ~TrackListPanel() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void setUsername(const juce::String& username);
    void refreshTracks();
    void loadMoreTracks();
    void setTrackSelectedCallback(TrackSelectedCallback callback);
    const TrackInfo* getSelectedTrack() const;
    void clearTracks();
    void selectTrackById(const juce::String& trackId);

private:
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
            const bool hovered = rowNumber == ownerPanel.trackListBox.getHoveredRow();

            if (rowNumber == ownerPanel.tracks.size() && ownerPanel.pagination.hasMore)
            {
                ListRowPainter::paintLoadMore(g, width, height, hovered);
                return;
            }

            if (rowNumber < 0 || rowNumber >= ownerPanel.tracks.size())
                return;

            const auto& track = ownerPanel.tracks[rowNumber];

            juce::String meta;
            if (track.username.isNotEmpty())
                meta = track.username;
            if (track.metronome.isNotEmpty())
            {
                if (meta.isNotEmpty()) meta += metaSeparator();
                meta += "BPM: " + track.metronome;
            }
            if (track.timeSignature.isNotEmpty())
            {
                if (meta.isNotEmpty()) meta += metaSeparator();
                meta += track.timeSignature;
            }

            ListRowPainter::paintRow(g, width, height, rowIsSelected, hovered,
                                     track.title, meta);
        }

        juce::MouseCursor getMouseCursorForRow(int) override
        {
            return juce::MouseCursor::PointingHandCursor;
        }

        void listBoxItemClicked(int row, const juce::MouseEvent&) override
        {
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
    void loadTracksInternal(int page);
    void updateTracksDisplay(const LikedTracksResponse& response);
    void selectTrack(int trackIndex);
    void updateStatusView();

    SterioApiClient& apiClientRef;
    PluginState& pluginStateRef;
    juce::String currentUsername;

    juce::Array<TrackInfo> tracks;
    PaginationInfo pagination;
    int currentPage = 1;
    bool isLoading = false;
    bool hasLoadError = false;

    TrackSelectedCallback trackSelectedCallback;

    SectionHeaderBar sectionHeader;
    ListStatusView statusView;
    HoverTrackingListBox trackListBox;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TrackListPanel)
};
