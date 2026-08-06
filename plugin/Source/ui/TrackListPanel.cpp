#include "TrackListPanel.h"
#include "../Colors.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include "../utils/MessageStore.h"
#include <chrono>

using namespace juce;

//==============================================================================
TrackListPanel::TrackListPanel(Services& services)
    : apiClientRef(services.api),
      pluginStateRef(services.pluginState),
      sectionHeader("Liked Tracks"),
      trackListBox("Tracks")
{
    pluginStateRef.addChangeListener(this);

    addAndMakeVisible(sectionHeader);
    sectionHeader.setOnRefresh([this] { refreshTracks(); });

    addAndMakeVisible(statusView);
    statusView.setState(ListStatusView::State::Empty, "No tracks loaded");

    trackListBox.setModel(new TrackListPanel::TrackListBoxModel(*this));
    trackListBox.setRowHeight(UiMetrics::listRowH);
    trackListBox.setMultipleSelectionEnabled(false);
    trackListBox.setColour(ListBox::backgroundColourId, Colors::BACKGROUND);
    trackListBox.setColour(ListBox::outlineColourId, Colours::transparentBlack);
    addAndMakeVisible(trackListBox);

    startTimer(100);
}

TrackListPanel::~TrackListPanel()
{
    stopTimer();
    pluginStateRef.removeChangeListener(this);
}

void TrackListPanel::changeListenerCallback(juce::ChangeBroadcaster*)
{
    DBG("TrackListPanel::changeListenerCallback()");
    auto track = pluginStateRef.getCurrentTrack();
    selectTrackById(track.hasValue() ? (*track).id : juce::String());
}

void TrackListPanel::paint(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);
}

void TrackListPanel::resized()
{
    auto bounds = getLocalBounds();
    sectionHeader.setBounds(bounds.removeFromTop(UiMetrics::sectionChromeH));

    updateStatusView();

    const bool showList = !tracks.isEmpty() && !isLoading;
    trackListBox.setVisible(showList);
    statusView.setVisible(!showList);

    auto content = bounds.withTrimmedLeft(UiMetrics::listPadX)
                         .withTrimmedRight(UiMetrics::listPadX)
                         .withTrimmedBottom(UiMetrics::space3);

    if (showList)
        trackListBox.setBounds(content);
    else
        statusView.setBounds(bounds);
}

void TrackListPanel::updateStatusView()
{
    if (isLoading)
        statusView.setState(ListStatusView::State::Loading, "Loading tracks...");
    else if (hasLoadError)
        statusView.setState(ListStatusView::State::Error, "Failed to load tracks");
    else if (tracks.isEmpty())
        statusView.setState(ListStatusView::State::Empty,
                            currentUsername.isEmpty() ? "No tracks loaded" : "No liked tracks");
}

void TrackListPanel::setUsername(const String& username)
{
    if (currentUsername != username)
    {
        currentUsername = username;
        refreshTracks();
    }
}

void TrackListPanel::refreshTracks()
{
    if (currentUsername.isEmpty())
        return;

    currentPage = 1;
    hasLoadError = false;
    tracks.clear();
    trackListBox.deselectAllRows();
    trackListBox.updateContent();
    loadTracksInternal(1);
}

void TrackListPanel::loadMoreTracks()
{
    if (currentUsername.isEmpty() || !pagination.hasMore || isLoading)
        return;

    loadTracksInternal(currentPage + 1);
}

void TrackListPanel::setTrackSelectedCallback(TrackSelectedCallback callback)
{
    trackSelectedCallback = callback;
}

const TrackInfo* TrackListPanel::getSelectedTrack() const
{
    int row = trackListBox.getSelectedRow();
    if (row >= 0 && row < tracks.size())
        return &tracks.getReference(row);

    return nullptr;
}

void TrackListPanel::clearTracks()
{
    tracks.clear();
    pagination = PaginationInfo();
    currentPage = 1;
    hasLoadError = false;
    trackListBox.deselectAllRows();
    trackListBox.updateContent();
    updateStatusView();
    resized();
}

void TrackListPanel::timerCallback()
{
    updateStatusView();
    resized();
}

void TrackListPanel::loadTracksInternal(int page)
{
    if (isLoading || currentUsername.isEmpty())
        return;

    isLoading = true;
    resized();

    Thread::launch([this, page]() {
        auto result = apiClientRef.getLikedTracks(currentUsername, page, 15);

        if (result.failed())
        {
            DBG("TrackListPanel::loadTracksInternal() - error loading tracks: " + result.getErrorMessage());
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to load tracks for user: " + currentUsername,
                .sourceModule = "TrackListPanel",
                .timestamp = std::chrono::system_clock::now()
            });
        }

        MessageManager::callAsync([this, result, page]() {
            isLoading = false;

            if (result.failed())
            {
                hasLoadError = true;
                updateStatusView();
                resized();
                return;
            }

            hasLoadError = false;
            currentPage = page;
            updateTracksDisplay(*result);
            resized();
        });
    });
}

void TrackListPanel::updateTracksDisplay(const LikedTracksResponse& response)
{
    if (currentPage == 1)
    {
        tracks = response.tracks;
        trackListBox.deselectAllRows();
    }
    else
    {
        tracks.addArray(response.tracks);
    }

    pagination = response.pagination;
    trackListBox.updateContent();
    auto currentTrack = pluginStateRef.getCurrentTrack();
    if (currentTrack.hasValue())
        selectTrackById((*currentTrack).id);
}

void TrackListPanel::selectTrack(int trackIndex)
{
    if (trackIndex >= 0 && trackIndex < tracks.size())
    {
        selectTrackById(tracks[trackIndex].id);

        if (trackSelectedCallback)
            trackSelectedCallback(tracks[trackIndex]);
    }
}

void TrackListPanel::selectTrackById(const juce::String& trackId)
{
    for (int i = 0; i < tracks.size(); ++i)
    {
        if (tracks[i].id == trackId)
        {
            trackListBox.selectRow(i);
            trackListBox.scrollToEnsureRowIsOnscreen(i);
            return;
        }
    }

    trackListBox.deselectAllRows();
    trackListBox.repaint();
}
